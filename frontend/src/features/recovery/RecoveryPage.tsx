import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { OutcomeBadge } from "@/components/data-display/badges";
import { ProportionBar, TrendChart } from "@/components/data-display/charts";
import { DataTable } from "@/components/data-display/DataTable";
import { FilterBar, FilterField } from "@/components/data-display/FilterBar";
import { MetricCard } from "@/components/data-display/MetricCard";
import { PageHeader } from "@/components/data-display/PageHeader";
import { Select } from "@/components/ui/form";
import { KeyValue, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { fmtDate, fmtNum, fmtPct, fmtSigned, fmtPeriod } from "@/lib/format";
import { OUTCOME_SOURCE, UNIT_TYPE } from "@/lib/labels";
import { api } from "@/services/api";
import type { Recovery, WindowMetrics } from "@/types/api";

function Window({ w, label }: { w: WindowMetrics | null; label: string }) {
  if (!w) return <span className="text-xs text-ink-2">Not available</span>;
  return (
    <div className="min-w-0 md:min-w-[9rem]">
      <ProportionBar value={w.completeness} ci={w.completeness_ci} label={`${label} completeness`} />
      <p className="mt-0.5 text-[11.5px] text-ink-2 tabular" title={w.completeness_ci ? `95% confidence interval ${fmtPct(w.completeness_ci[0])}–${fmtPct(w.completeness_ci[1])}` : undefined}>{w.received} of {w.expected} arrived{w.incomplete_share !== null && w.incomplete > 0 ? ` · ${fmtPct(w.incomplete_share)} forms incomplete` : ""}</p>
    </div>
  );
}

function BeforeAfter({ rows }: { rows: Recovery["before_after"] }) {
  const { unitName } = useSession();
  if (!rows.length) return <EmptyState title="No completed corrective actions in this scope">Before/after summaries appear once a follow-up action is marked completed.</EmptyState>;
  return (
    <DataTable caption="Before and after corrective actions" rows={rows} rowKey={(r) => r.assignment_id} mobileTitle={(r) => r.title} minWidth={1060}
      columns={[
        { key: "a", header: "Action", hideOnMobile: true, className: "min-w-[13rem]", cell: (r) => (
          <div><Link to={`/investigations/follow-up?assignment=${r.assignment_id}`} className="font-medium text-teal-900 hover:underline">{r.title}</Link><p className="mt-1 text-xs"><Link to={`/investigations/${r.concern_id}`} className="text-info-ink hover:underline">{r.concern_id}</Link></p><p className="text-xs text-ink-2">{r.data_label}</p>
            <p className="text-xs text-ink-2">{r.target_unit_ids.map(unitName).slice(0, 3).join(", ")}{r.target_unit_ids.length > 3 ? "…" : ""} · completed {fmtDate(r.completed_at)}</p></div>
        ) },
        { key: "b", header: "Before the problem", cell: (r) => <Window w={r.before} label="Before" /> },
        { key: "d", header: "During", cell: (r) => <Window w={r.during} label="During" /> },
        { key: "af", header: "After the action", cell: (r) => (r.after ? <Window w={r.after} label="After" /> : <span className="text-xs text-ink-2">{r.after_message}</span>) },
        { key: "c", header: "Change", align: "right", cell: (r) => fmtSigned(r.change_vs_during) },
        { key: "o", header: "Result", className: "min-w-[11rem]", cell: (r) => (
          <div className="flex flex-col items-start gap-1">
                        {r.outcomes.length ? <><OutcomeBadge status={r.outcomes[r.outcomes.length - 1].status} /><span className="text-xs text-ink-2">{OUTCOME_SOURCE[r.outcomes[r.outcomes.length - 1].source] ?? r.outcomes[r.outcomes.length - 1].source}</span></> : <span className="text-xs text-ink-2">No outcome recorded</span>}
          </div>
        ) },
      ]} />
  );
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

  return (
    <>
      <PageHeader title="Recovery Assessment" description="Monitor reporting restoration and assess intervention progress." />
      <div className="iris-workspace-stack">
        <FilterBar activeCount={active} onReset={() => setF(DEF)} label="Recovery filters">
          <FilterField label="Dataset" className="w-full md:w-64">{(id) => <Select id={id} value={f.dataset_id} onChange={(e) => setF({ ...DEF, dataset_id: e.target.value })}>{datasets.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</FilterField>
          <FilterField label="Province">{(id) => <Select id={id} value={f.province} onChange={(e) => setF({ ...f, province: e.target.value, unit_id: "" })}><option value="">All</option>{meta?.provinces.map((p) => <option key={p}>{p}</option>)}</Select>}</FilterField>
          <FilterField label="Unit type" className="w-full md:w-36">{(id) => <Select id={id} value={f.unit_type} onChange={(e) => setF({ ...f, unit_type: e.target.value, unit_id: "" })}><option value="">All</option>{(["rhu", "hospital", "laboratory"] as const).map((t) => <option key={t} value={t}>{UNIT_TYPE[t]}</option>)}</Select>}</FilterField>
          <FilterField label="Reporting unit" className="w-full md:w-52">{(id) => <Select id={id} value={f.unit_id} onChange={(e) => setF({ ...f, unit_id: e.target.value })}><option value="">All units</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>}</FilterField>
          <FilterField label="Category">{(id) => <Select id={id} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">All weekly reports</option>{meta?.categories.map((c) => <option key={c.code} value={c.code}>{c.name}{c.frequency === "monthly" ? " (monthly)" : ""}</option>)}</Select>}</FilterField>
          <FilterField label="From">{(id) => <Select id={id} value={f.w_from} onChange={(e) => setF({ ...f, w_from: e.target.value })}>{weekOpts.map((w) => <option key={w.week} value={w.week} disabled={w.week > Number(f.w_to)}>{w.label}</option>)}</Select>}</FilterField>
          <FilterField label="To">{(id) => <Select id={id} value={f.w_to} onChange={(e) => setF({ ...f, w_to: e.target.value })}>{weekOpts.map((w) => <option key={w.week} value={w.week} disabled={w.week < Number(f.w_from)}>{w.label}</option>)}</Select>}</FilterField>
        </FilterBar>

        {datasets.error && <ErrorState error={datasets.error} onRetry={() => datasets.refetch()} title="Dataset options unavailable" />}
        {d && !q.isPlaceholderData && <Panel className="iris-decision-hero iris-recovery-hero" motif="trends" bodyClassName="p-6 lg:p-8">
          <p className="iris-eyebrow mb-3">Observed reporting restoration</p>
          <h2 className="text-2xl font-semibold">{d.dataset.name}</h2>
          <p className="mt-3 max-w-2xl text-sm">Examine received submissions and follow-up evidence over time. Reporting changes are observations; they do not establish that an intervention caused improvement.</p>
          <div className="mt-5"><KeyValue columns={3} items={[{ label: "Reporting scope", value: scope }, { label: "Selected reporting weeks", value: fmtPeriod(weekOpts[Number(f.w_from)]?.start, weekOpts[Number(f.w_to)]?.end) }, { label: "Dataset classification", value: d.dataset.designation }]} /></div>
          {d.causality_note && <p className="mt-4 text-xs text-ink-2">{d.causality_note}</p>}
        </Panel>}
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
                <MetricCard label="Reporting completeness" value={d.overall.completeness == null ? "Unavailable" : fmtPct(d.overall.completeness)} detail={`${fmtNum(d.overall.received)} received / ${fmtNum(d.overall.expected)} expected submissions.`} motif="records" />
                <MetricCard label="Reporting timeliness" value={!d.timeliness_available || d.overall.timeliness == null ? "Unavailable" : fmtPct(d.overall.timeliness)} detail="Received by the due date / expected submissions." motif="trends" />
                <MetricCard label="Reports not received" value={fmtNum(d.overall.not_received)} detail="Expected submissions missing in the selected reporting period." motif="verify" />
                <MetricCard label="Open concerns" value={d.concern_totals?.open ?? "Unavailable"} detail="Dataset/unit selection; concern totals are not limited to selected weeks." motif="network" />
              </div>
            )}
            <Panel title="Reporting recovery trend" motif="trends" description={`${fmtNum(d.overall?.expected)} expected ${f.category ? categoryName(f.category) : "weekly"} reports. ${d.frequency === "monthly" ? "Monthly series; week filters do not restrict monthly submissions." : "Selected reporting weeks."} Classification: ${d.dataset.designation}.`}>
              {!hasSeries ? <EmptyState title={d.series.length ? "Reporting series unavailable" : "No expected reports in this selection"} /> : (
                <TrendChart title="Completeness and timeliness" data={d.series} xKey="period_start" height={320} series={[{ key: "completeness", label: "Completeness" }, { key: "timeliness", label: "Timeliness" }]} />
              )}
              <p className="mt-2 text-xs text-ink-2">The latest week can still receive late reports. “Arrived” = received ÷ expected; “on time” = received by the due date ÷ expected.</p>
            </Panel>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <Panel motif="network" title="Open and closed concerns" description={d.concern_totals ? `${d.concern_totals.open} open · ${d.concern_totals.resolved} resolved · ${d.concern_totals.dismissed} dismissed in this selection across all concern periods.` : undefined}>
                <TrendChart title="Concerns open at week end and closed in week" percent={false} height={220} xKey="period_start"
                  data={d.concerns.map((c) => ({ ...c, closed: c.resolved + c.dismissed }))} series={[{ key: "open_at_end", label: "Open at end of week" }, { key: "closed", label: "Closed during week" }]} />
                {!!d.concerns_after_snapshot && <p className="mt-1 text-xs text-ink-2">{d.concerns_after_snapshot} concern(s) were created after the dataset snapshot and are not shown on the timeline.</p>}
              </Panel>
              <Panel variant="secondary" motif="verify" title="Time to resolution" description="Median days from being flagged to being closed.">
                {d.resolution.length === 0 ? <p className="text-sm text-ink-2">No concerns in this scope.</p> : (
                  <div className="overflow-x-auto" role="region" aria-label="Concern resolution statistics" tabIndex={0}>
                    <table className="w-full min-w-[30rem] text-sm">
                      <caption className="sr-only">Time to resolution by concern type</caption>
                      <thead className="text-left text-xs text-ink-2"><tr><th scope="col" className="py-1.5 font-semibold">Concern type</th><th scope="col" className="py-1.5 text-right font-semibold">Resolved</th><th scope="col" className="py-1.5 text-right font-semibold">Median days</th><th scope="col" className="py-1.5 text-right font-semibold">Dismissed</th><th scope="col" className="py-1.5 text-right font-semibold">Median days</th><th scope="col" className="py-1.5 text-right font-semibold">Still open</th></tr></thead>
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
            <Panel title="Before, during and after corrective actions" motif="records" description="Observed submission windows supplied by the backend. These windows may extend beyond chart week/category filters; changes are not causal estimates." bodyClassName="p-0">
              <div className="px-4 py-2 md:p-0"><BeforeAfter rows={d.before_after} /></div>
            </Panel>
          </>
        )}
      </div>
    </>
  );
}
