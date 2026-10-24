import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { DesignationBadge, OutcomeBadge } from "@/components/data-display/badges";
import { TrendChart } from "@/components/data-display/charts";
import { FilterBar, FilterField } from "@/components/data-display/FilterBar";
import { MetricCard } from "@/components/data-display/MetricCard";
import { PageHeader } from "@/components/data-display/PageHeader";
import { Select } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { isoWeekLabel } from "@/hooks/useGlobalFilters";
import { useSession } from "@/hooks/useSession";
import { fmtDate, fmtNum, fmtPct, fmtPeriod } from "@/lib/format";
import { OUTCOME_SOURCE, UNIT_TYPE } from "@/lib/labels";
import { api } from "@/services/api";
import type { Recovery, WindowMetrics } from "@/types/api";

type Row = Recovery["before_after"][number];

/** One stage of an action's story: the share of expected reports that arrived, as a number and a bar. */
function Stage({ w, label, short, fallback }: { w: WindowMetrics | null; label: string; short: string; fallback?: string | null }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs text-ink-2"><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></p>
      {w ? <>
        <p className="mt-0.5 text-[22px] leading-tight font-semibold text-ink tabular">{fmtPct(w.completeness)}</p>
        <div className="mt-1.5 h-1.5 rounded-full bg-line" aria-hidden><div className="h-1.5 rounded-full bg-teal-600" style={{ width: `${(w.completeness ?? 0) * 100}%` }} /></div>
        <p className="mt-1.5 text-xs text-ink-2 tabular">{w.received} of {w.expected} arrived{w.incomplete > 0 && w.incomplete_share !== null ? <><br />{fmtPct(w.incomplete_share)} of forms had blanks</> : null}</p>
      </> : <p className="mt-1 text-[13px] text-ink-2">{fallback ?? "Not available"}</p>}
    </div>
  );
}

/** "Reports arriving fell from 93% to 52% while the problem lasted, then were 93% after the action." */
function story(r: Row): string | null {
  const b = r.before?.completeness, d = r.during?.completeness, a = r.after?.completeness;
  if (b == null || d == null) return null;
  const pct = (v: number) => fmtPct(v);
  const first = d < b - 0.005 ? `fell from ${pct(b)} to ${pct(d)}` : d > b + 0.005 ? `rose from ${pct(b)} to ${pct(d)}` : `stayed at ${pct(d)}`;
  const then = a == null ? "There is no reporting after the action to compare yet."
    : a > d + 0.005 ? `After the action it was back up to ${pct(a)}.` : a < d - 0.005 ? `After the action it went down to ${pct(a)}.` : `After the action it was unchanged at ${pct(a)}.`;
  return `Reports arriving ${first} while the problem lasted. ${then}`;
}

function ActionCard({ r }: { r: Row }) {
  const { unitName } = useSession();
  const outcome = r.outcomes.at(-1);
  const units = r.target_unit_ids.map(unitName);
  const text = story(r);
  return (
    <li className="rounded-lg border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Link to={`/investigations/follow-up?assignment=${r.assignment_id}`} className="text-[15px] font-semibold text-teal-900 hover:underline">{r.title}</Link>
          <p className="mt-0.5 text-xs text-ink-2">
            For <Link to={`/investigations/${r.concern_id}`} className="text-info-ink hover:underline">{r.concern_id}</Link>
            {" · "}{units.slice(0, 2).join(", ")}{units.length > 2 ? ` and ${units.length - 2} more` : ""}
            {r.completed_at && <> · done {fmtDate(r.completed_at)}</>}
          </p>
        </div>
        {outcome ? <OutcomeBadge status={outcome.status} /> : <span className="text-xs text-ink-2">No result recorded yet</span>}
      </div>
      {text && <p className="mt-3 text-sm text-ink">{text}</p>}
      <div className="mt-4 flex items-start gap-2 sm:gap-4">
        <Stage w={r.before} label="Before the problem" short="Before" />
        <ArrowRight className="mt-6 size-4 shrink-0 text-ink-2" aria-hidden />
        <Stage w={r.during} label="During the problem" short="During" />
        <ArrowRight className="mt-6 size-4 shrink-0 text-ink-2" aria-hidden />
        <Stage w={r.after} label="After the action" short="After" fallback={r.after_message} />
      </div>
      {r.after_overlaps.length > 0 && (
        <p className="mt-3 rounded-md bg-attention-bg px-3 py-2 text-xs text-attention-ink">
          Another problem affected these units in the weeks after the action, so the “after” figure may be lower for reasons unrelated to it:{" "}
          {r.after_overlaps.map((o, i) => <span key={o.id}>{i > 0 && ", "}<Link to={`/investigations/${o.id}`} className="font-medium underline">{o.id}</Link> ({o.title})</span>)}.
        </p>
      )}
      {outcome && (
        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-2">
          <span className="font-medium text-ink">Result: </span>{outcome.summary} <span className="whitespace-nowrap">({OUTCOME_SOURCE[outcome.source] ?? outcome.source})</span>
        </p>
      )}
    </li>
  );
}

function BeforeAfter({ rows }: { rows: Recovery["before_after"] }) {
  if (!rows.length) return <EmptyState title="No finished corrective actions in this selection">Each action appears here once its follow-up is marked done.</EmptyState>;
  return <ul className="flex flex-col gap-3">{rows.map((r) => <ActionCard key={r.assignment_id} r={r} />)}</ul>;
}

export function RecoveryPage() {
  const { meta, categoryName } = useSession();
  const last = (meta?.weeks.length ?? 26) - 1;
  const DEF = { dataset_id: meta?.demo_dataset_id ?? "", province: "", unit_type: "", unit_id: "", category: "", w_from: "0", w_to: String(last) };
  const [f, setF] = useState(DEF);
  const datasets = useQuery({ queryKey: ["datasets"], queryFn: api.datasets });
  const q = useQuery({ queryKey: ["recovery", f], queryFn: () => api.recovery(f), placeholderData: (p) => p });
  const active = Object.entries(f).filter(([k, v]) => v !== DEF[k as keyof typeof DEF]).length;
  const d = q.data;
  const hasSeries = d?.series.some((row) => row.completeness !== null || row.timeliness !== null);
  const scope = f.unit_id ? meta?.units.find((u) => u.id === f.unit_id)?.name ?? f.unit_id : f.province || "All dataset units";
  const units = meta?.units.filter((u) => u.unit_type !== "hub" && (!f.province || u.province === f.province) && (!f.unit_type || u.unit_type === f.unit_type)) ?? [];
  const weekOpts = meta?.weeks ?? [];
  const period = fmtPeriod(weekOpts[Number(f.w_from)]?.start, weekOpts[Number(f.w_to)]?.end);

  return (
    <>
      <PageHeader title="Reporting recovery" description="Are reports arriving again after problems were found and acted on?" />
      <div className="iris-workspace-stack">
        <FilterBar activeCount={active} onReset={() => setF(DEF)} label="Recovery filters">
          <FilterField label="Dataset" className="md:w-64">{(id) => <Select id={id} value={f.dataset_id} onChange={(e) => setF({ ...DEF, dataset_id: e.target.value })}>{datasets.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</FilterField>
          <FilterField label="Province">{(id) => <Select id={id} value={f.province} onChange={(e) => setF({ ...f, province: e.target.value, unit_id: "" })}><option value="">All</option>{meta?.provinces.map((p) => <option key={p}>{p}</option>)}</Select>}</FilterField>
          <FilterField label="Unit type" className="md:w-36">{(id) => <Select id={id} value={f.unit_type} onChange={(e) => setF({ ...f, unit_type: e.target.value, unit_id: "" })}><option value="">All</option>{(["rhu", "hospital", "laboratory"] as const).map((t) => <option key={t} value={t}>{UNIT_TYPE[t]}</option>)}</Select>}</FilterField>
          <FilterField label="Reporting unit" className="md:w-52">{(id) => <Select id={id} value={f.unit_id} onChange={(e) => setF({ ...f, unit_id: e.target.value })}><option value="">All units</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>}</FilterField>
          <FilterField label="Category">{(id) => <Select id={id} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">All weekly reports</option>{meta?.categories.map((c) => <option key={c.code} value={c.code}>{c.name}{c.frequency === "monthly" ? " (monthly)" : ""}</option>)}</Select>}</FilterField>
          <FilterField label="From">{(id) => <Select id={id} value={f.w_from} onChange={(e) => setF({ ...f, w_from: e.target.value })}>{weekOpts.map((w) => <option key={w.week} value={w.week} disabled={w.week > Number(f.w_to)}>{isoWeekLabel(w)}</option>)}</Select>}</FilterField>
          <FilterField label="To">{(id) => <Select id={id} value={f.w_to} onChange={(e) => setF({ ...f, w_to: e.target.value })}>{weekOpts.map((w) => <option key={w.week} value={w.week} disabled={w.week < Number(f.w_from)}>{isoWeekLabel(w)}</option>)}</Select>}</FilterField>
        </FilterBar>

        {datasets.error && <ErrorState error={datasets.error} onRetry={() => datasets.refetch()} title="Dataset options unavailable" />}
        {d && !q.isPlaceholderData && (
          <section aria-labelledby="recovery-summary" className="flex flex-col gap-2">
            <p className="iris-eyebrow">{scope} · {period}</p>
            <h2 id="recovery-summary" className="max-w-4xl text-[22px] leading-snug font-semibold text-ink">
              {d.overall?.completeness != null
                ? <>{fmtPct(d.overall.completeness)} of expected reports arrived{d.timeliness_available && d.overall.timeliness != null ? <>, {fmtPct(d.overall.timeliness)} on time</> : null}. {fmtNum(d.overall.not_received)} never arrived. </>
                : <>Arrival rates are not available for this selection. </>}
              {d.concern_totals && <>{d.concern_totals.open} concern{d.concern_totals.open === 1 ? " is" : "s are"} still open and {d.concern_totals.resolved} {d.concern_totals.resolved === 1 ? "has" : "have"} been fixed.</>}
            </h2>
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">{d.dataset.name} <DesignationBadge designation={d.dataset.designation} /></p>
            {d.causality_note && <p className="max-w-4xl text-xs text-ink-2">Improvement after an action does not prove the action caused it. {d.causality_note.replace(/^Before\/after comparisons show association only\. /, "")}</p>}
          </section>
        )}
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !d || q.isPlaceholderData ? <Loading label="Loading selected recovery context" /> : !d.completeness_available ? (
          <Panel title="Recovery metrics">
            <div className="flex flex-col gap-3">
              {d.messages.map((m) => <p key={m} className="rounded-sm border border-line bg-porcelain px-3 py-2 text-sm text-ink">{m}</p>)}
              {d.received_records_on_time_share && <p className="text-sm">Of {fmtNum(d.received_records_on_time_share.records)} received records with timestamps, {fmtPct(d.received_records_on_time_share.share)} arrived by their due date. {d.received_records_on_time_share.note}</p>}
            </div>
          </Panel>
        ) : (
          <>
            {d.overall && (
              <div className="iris-phase4-metrics grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Reports arrived" value={d.overall.completeness == null ? "Unavailable" : fmtPct(d.overall.completeness)} detail={`${fmtNum(d.overall.received)} of ${fmtNum(d.overall.expected)} expected reports.`} motif="records" />
                <MetricCard label="Arrived on time" value={!d.timeliness_available || d.overall.timeliness == null ? "Unavailable" : fmtPct(d.overall.timeliness)} detail="Arrived by the due date, out of all expected reports." motif="trends" />
                <MetricCard label="Never arrived" value={fmtNum(d.overall.not_received)} detail={`Out of ${fmtNum(d.overall.expected)} expected in these weeks.`} motif="verify" />
                <MetricCard label="Open concerns" value={d.concern_totals?.open ?? "Unavailable"} detail="Open now, from any week, for these units." motif="network" />
              </div>
            )}
            <Panel title="Reports arriving each week" motif="trends" description={`Share of the expected ${f.category ? `${categoryName(f.category)} ` : ""}reports that arrived, and that arrived on time.${d.frequency === "monthly" ? " Monthly reports: the week filters do not apply." : ""}`}>
              {!hasSeries ? <EmptyState title={d.series.length ? "Reporting series unavailable" : "No expected reports in this selection"} /> : (
                <TrendChart title="Share of expected reports that arrived each week" data={d.series} xKey="period_start" height={300} series={[{ key: "completeness", label: "Arrived" }, { key: "timeliness", label: "On time" }]} />
              )}
              <p className="mt-2 text-xs text-ink-2">The latest week can still receive late reports, so it may rise.</p>
            </Panel>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <Panel motif="network" title="Concerns over time" description={d.concern_totals ? `${d.concern_totals.open} open now · ${d.concern_totals.resolved} fixed · ${d.concern_totals.dismissed} closed as not a problem.` : undefined}>
                <TrendChart title="Concerns still open at the end of each week, and closed during it" percent={false} height={220} xKey="period_start"
                  data={d.concerns.map((c) => ({ ...c, closed: c.resolved + c.dismissed }))} series={[{ key: "open_at_end", label: "Still open" }, { key: "closed", label: "Closed that week" }]} />
                {!!d.concerns_after_snapshot && <p className="mt-1 text-xs text-ink-2">{d.concerns_after_snapshot} newer concern{d.concerns_after_snapshot === 1 ? " was" : "s were"} raised after this data was taken, so {d.concerns_after_snapshot === 1 ? "it is" : "they are"} not on the chart.</p>}
              </Panel>
              <Panel variant="secondary" motif="verify" title="How long concerns take to close" description="Typical days (median) from the flag to closing it. “—” means none were closed that way yet.">
                {d.resolution.length === 0 ? <p className="text-sm text-ink-2">No concerns in this scope.</p> : (
                  <div className="overflow-x-auto" role="region" aria-label="Concern resolution statistics" tabIndex={0}>
                    <table className="w-full min-w-[30rem] text-sm">
                      <caption className="sr-only">Time to resolution by concern type</caption>
                      <thead className="text-left text-xs text-ink-2"><tr><th scope="col" className="py-1.5 font-semibold">Type of concern</th><th scope="col" className="py-1.5 pl-3 text-right font-semibold">Fixed</th><th scope="col" className="py-1.5 pl-3 text-right font-semibold">Days to fix</th><th scope="col" className="py-1.5 pl-3 text-right font-semibold">Not a problem</th><th scope="col" className="py-1.5 pl-3 text-right font-semibold">Days to close</th><th scope="col" className="py-1.5 pl-3 text-right font-semibold">Still open</th></tr></thead>
                      <tbody>{d.resolution.map((r) => (
                        <tr key={r.concern_type} className="border-t border-line"><th scope="row" className="py-1.5 text-left font-medium">{meta?.labels.concern_type[r.concern_type]}</th>
                          <td className="py-1.5 text-right tabular">{r.resolved}</td><td className="py-1.5 text-right tabular">{fmtNum(r.median_days_to_resolution, 1)}</td>
                          <td className="py-1.5 text-right tabular">{r.dismissed}</td><td className="py-1.5 text-right tabular">{fmtNum(r.median_days_to_dismissal, 1)}</td><td className="py-1.5 text-right tabular">{r.open}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>
            <Panel title="Did reporting come back after each action?" motif="records" description="For each finished action: the share of expected reports that arrived before the problem, during it, and after the action. Each action's own weeks are used, so they can fall outside the filters above.">
              <BeforeAfter rows={d.before_after} />
            </Panel>
          </>
        )}
      </div>
    </>
  );
}
