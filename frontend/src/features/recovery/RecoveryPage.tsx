import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { OutcomeBadge } from "@/components/data-display/badges";
import { TrendChart } from "@/components/data-display/charts";
import { FilterBar, FilterField } from "@/components/data-display/FilterBar";
import { PageHero } from "@/components/shell/PageHero";
import { Select } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { isoWeekLabel } from "@/hooks/useGlobalFilters";
import { useSession } from "@/hooks/useSession";
import { fmtDate, fmtNum, fmtPct, fmtPeriod } from "@/lib/format";
import { api } from "@/services/api";
import type { Recovery } from "@/types/api";

type Row = Recovery["before_after"][number];

/** One finished action as a small chart: the share of expected reports that arrived before, during and after. */
function ActionCard({ r }: { r: Row }) {
  const { unitName } = useSession();
  const outcome = r.outcomes.at(-1);
  const units = r.target_unit_ids.map(unitName);
  const bars = [
    { label: "Before", w: r.before, color: "#7893A8" },
    { label: "During", w: r.during, color: "#B65F59" },
    { label: "After", w: r.after, color: "#1A9EA0" },
  ];
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-white p-4">
      <div className="min-w-0">
        <Link to={`/investigations/follow-up?assignment=${r.assignment_id}`} className="line-clamp-2 text-[14px] leading-snug font-semibold text-teal-900 hover:underline">{r.title}</Link>
        <p className="mt-0.5 truncate text-xs text-ink-2">
          <Link to={`/investigations/${r.concern_id}`} className="text-info-ink hover:underline">{r.concern_id}</Link>
          {" · "}{units.slice(0, 2).join(", ")}{units.length > 2 ? ` +${units.length - 2}` : ""}{r.completed_at && <> · done {fmtDate(r.completed_at)}</>}
        </p>
      </div>
      <div className="grid grid-cols-3 items-end gap-3" role="img" aria-label={bars.map((b) => `${b.label}: ${b.w ? fmtPct(b.w.completeness) : "not available"}`).join(", ")}>
        {bars.map((b) => (
          <div key={b.label} className="flex flex-col items-center gap-1">
            <span className="text-[15px] font-semibold tabular" style={{ color: b.label === "During" ? "#9B463F" : "#0A3A4A" }}>{b.w ? fmtPct(b.w.completeness) : "—"}</span>
            <div className="flex h-24 w-full max-w-[3.5rem] items-end rounded-t bg-tint/60">
              <div className="w-full rounded-t" style={{ height: `${(b.w?.completeness ?? 0) * 100}%`, background: b.color }} />
            </div>
            <span className="text-[11.5px] text-ink-2">{b.label}</span>
          </div>
        ))}
      </div>
      {r.after_overlaps.length > 0 && (
        <p className="rounded-md bg-attention-bg px-2.5 py-1.5 text-[11.5px] text-attention-ink">
          “After” overlaps {r.after_overlaps.map((o, i) => <span key={o.id}>{i > 0 && ", "}<Link to={`/investigations/${o.id}`} className="font-medium underline">{o.id}</Link></span>)}, so it may be lower for another reason.
        </p>
      )}
      <div className="mt-auto">{outcome ? <OutcomeBadge status={outcome.status} /> : <span className="text-xs text-ink-2">No result recorded yet</span>}</div>
    </li>
  );
}

function BeforeAfter({ rows }: { rows: Recovery["before_after"] }) {
  if (!rows.length) return <EmptyState title="No finished corrective actions in this selection">Each action appears here once its follow-up is marked done.</EmptyState>;
  return <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{rows.map((r) => <ActionCard key={r.assignment_id} r={r} />)}</ul>;
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
  const weekOpts = meta?.weeks ?? [];
  const period = fmtPeriod(weekOpts[Number(f.w_from)]?.start, weekOpts[Number(f.w_to)]?.end);

  return (
    <>
      <PageHero section="reports" eyebrow="Evidence workspace / Recovery" title="Did reporting come back after each fix?" subtitle={`${scope} · ${period}`} />
      <div className="iris-workspace-stack">
        <FilterBar activeCount={active} onReset={() => setF(DEF)} label="Recovery filters">
          <FilterField label="Province">{(id) => <Select id={id} value={f.province} onChange={(e) => setF({ ...f, province: e.target.value, unit_id: "" })}><option value="">All</option>{meta?.provinces.map((p) => <option key={p}>{p}</option>)}</Select>}</FilterField>
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
            <div data-tour="recovery-actions"><Panel title="After each fix" motif="records" description="Share of expected reports that arrived before the problem, during it, and after the action.">
              <BeforeAfter rows={d.before_after} />
            </Panel></div>
            <Panel title="Reports arriving each week" motif="trends" description={`Share of the expected ${f.category ? `${categoryName(f.category)} ` : ""}reports that arrived, and that arrived on time.${d.frequency === "monthly" ? " Monthly reports: the week filters do not apply." : ""}`}>
              {!hasSeries ? <EmptyState title={d.series.length ? "Reporting series unavailable" : "No expected reports in this selection"} /> : (
                <TrendChart title="Share of expected reports that arrived each week" data={d.series} xKey="period_start" height={300} series={[{ key: "completeness", label: "Arrived" }, { key: "timeliness", label: "On time" }]} />
              )}
              <p className="mt-2 text-xs text-ink-2">The latest week can still receive late reports, so it may rise.</p>
            </Panel>
            <details className="group rounded-lg border border-line bg-white">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-semibold text-teal-900 [&::-webkit-details-marker]:hidden">More detail: concerns over time and days to close<span aria-hidden className="text-ink-2 transition-transform group-open:rotate-180">▾</span></summary>
              <div className="border-t border-line p-4">
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
              </div>
            </details>
          </>
        )}
      </div>
    </>
  );
}
