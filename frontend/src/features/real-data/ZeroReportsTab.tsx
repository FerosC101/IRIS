import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DataTable } from "@/components/data-display/DataTable";
import { ChipFilter, FilterBar, FilterField } from "@/components/data-display/FilterBar";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Select } from "@/components/ui/form";
import { Drawer } from "@/components/ui/overlay";
import { Pagination } from "@/components/ui/pagination";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import type { Tone } from "@/lib/labels";
import { api } from "@/services/api";
import type { ZeroBand, ZeroReportItem, ZeroReports } from "@/types/api";
import { StatStrip, WeekBars, WeekStepper } from "./charts";
import { fmtChance } from "./format";
import { LeadReviewSection, ReviewBadge, useRealStatus } from "./LeadReview";

const MISSING: ZeroBand = "Missing report (not ranked)";
const BAND_TONE: Record<ZeroBand, Tone> = { High: "critical", Medium: "attention", Low: "neutral", [MISSING]: "info" };

export function BandBadge({ band }: { band: ZeroBand }) {
  return <Badge className="whitespace-nowrap" tone={BAND_TONE[band] ?? "neutral"}>{band === MISSING ? "Missing report" : `${band} priority`}</Badge>;
}

export function ReviewFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const labels = useRealStatus().data?.review_statuses;
  return (
    <FilterField label="Review">{(id) => (
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Any</option><option value="unreviewed">Not reviewed</option>
        {labels && Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
    )}</FilterField>
  );
}

export const weekLabel = (w: { week_start: string; mw?: number | null; mw_year?: number | null }) =>
  `${w.mw ? `MW ${w.mw} · ` : ""}week of ${fmtDate(w.week_start)}`;

/** Why this zero was ranked where it was: only the indicators the score uses, plus the rest on request. */
function Indicators({ item, d }: { item: ZeroReportItem; d: ZeroReports }) {
  const entries = Object.entries(item.components);
  const used = entries.filter(([k]) => (d.model.weights[k] ?? 0) > 0);
  const other = entries.filter(([k]) => !((d.model.weights[k] ?? 0) > 0));
  const row = ([k, v]: [string, number]) => (
    <li key={k} className="grid grid-cols-[minmax(0,1fr)_6rem_2.5rem] items-center gap-2 text-[13px]">
      <span>{d.indicator_labels[k] ?? k}</span>
      <span className="h-2 rounded-sm bg-aqua-50" aria-hidden><span className="block h-2 rounded-sm bg-teal-800" style={{ width: `${Math.round(v * 100)}%` }} /></span>
      <span className="text-right tabular">{v.toFixed(2)}</span>
    </li>
  );
  return (
    <section aria-labelledby="why-ranked">
      <h3 id="why-ranked" className="mb-2 text-sm font-semibold">What the score looked at</h3>
      <ul className="flex flex-col gap-1.5">{used.map(row)}</ul>
      <p className="mt-1 text-xs text-ink-2">0 = no sign of a problem, 1 = strong sign.</p>
      {other.length > 0 && (
        <details className="mt-2 text-[13px]">
          <summary className="cursor-pointer text-xs font-medium text-teal-900">Other signals (not in the score)</summary>
          <ul className="mt-2 flex flex-col gap-1.5">{other.map(row)}</ul>
        </details>
      )}
    </section>
  );
}

function ZeroDetail({ item, d }: { item: ZeroReportItem; d: ZeroReports }) {
  if (item.report_status === "missing") {
    return (
      <div className="flex flex-col gap-4">
        <Callout variant="info" label="Missing report">No report was received for this week. A missing submission is not a zero report, so it is listed but not ranked.</Callout>
        <LeadReviewSection leadType="zero_report" leadId={item.alert_id} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2"><BandBadge band={item.priority} /><ReviewBadge review={item.review} /><span className="text-xs text-ink-2">Rank {item.rank_in_week} this week</span></div>
      <p className="text-[15px] leading-relaxed">
        Reported <strong>0 cases</strong> (observed). Model A expected about <strong>{fmtNum(item.expected, 1)}</strong> (model estimate); if reporting were normal, a zero would happen {fmtChance(item.p_low)} of the time.
      </p>
      <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
        <div><dt className="text-xs text-ink-2">Priority score (for ranking only)</dt><dd className="mt-0.5"><strong className="tabular">{fmtNum(item.priority_score, 0)} of 100</strong>. A weighted average of the signals the score uses (below), times 100. It orders the list; it is not a probability.</dd></div>
        {item.p_priority != null && <div><dt className="text-xs text-ink-2">Estimated chance of a reporting problem</dt><dd className="mt-0.5"><strong className="tabular">{fmtPct(item.p_priority)}</strong> (range {fmtPct(item.p_priority_low)}–{fmtPct(item.p_priority_high)}). Calibrated on data before 2020, so treat it as a rough guide; see “How well it works”.</dd></div>}
      </dl>
      <Callout variant="model-flag" by="Model B">{item.explanation}</Callout>
      <Indicators item={item} d={d} />
      {item.verification_steps.length > 0 && (
        <section aria-labelledby="verify-steps">
          <h3 id="verify-steps" className="mb-2 text-sm font-semibold">How to check it</h3>
          <ol className="list-decimal pl-5 text-[13px] leading-relaxed">{item.verification_steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </section>
      )}
      {item.data_warnings.length > 0 && (
        <details className="rounded-md bg-tint px-4 py-3 text-[13px]">
          <summary className="cursor-pointer text-xs font-semibold tracking-wide text-teal-800 uppercase">Limits of the data ({item.data_warnings.length})</summary>
          <ul className="mt-2 list-disc pl-4">{item.data_warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          <p className="mt-2 text-xs text-ink-2">History: {item.data_sufficiency}. Model A {item.model_a_flag ? "also flagged" : "did not flag"} this week.</p>
        </details>
      )}
      <LeadReviewSection leadType="zero_report" leadId={item.alert_id} />
    </div>
  );
}

export function ZeroReportsTab() {
  const DEF = { region: "", review: "" };
  const [week, setWeek] = useState("");
  const [band, setBand] = useState("");
  const [f, setF] = useState(DEF);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ZeroReportItem | null>(null);
  const q = useQuery({ queryKey: ["real", "zero", week, band, f, page], queryFn: () => api.realZeroReports({ week, band, ...f, page, page_size: 15 }), placeholderData: (p) => p });
  const d = q.data;
  const wk = d?.weeks.find((w) => w.week_start === d.week);
  // Fresh copy after a review; the row may leave the filtered list, so fall back to the one that was opened.
  const current = open && (d?.items.find((i) => i.alert_id === open.alert_id) ?? open);
  const pick = (w: string) => { setWeek(w); setPage(1); };

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!d || !wk) return <Loading label="Loading zero reports" />;
  const weeks = d.weeks.map((w) => ({ ...w, other: w.medium + w.low }));
  return (
    <div className="flex flex-col gap-5">
      <Panel title="Zero reports each week" description="Places that reported zero dengue cases. Dark bars are the ones most likely to hide a reporting problem. Click a week to see its list.">
        <WeekBars title="Zero reports per week by priority" data={weeks} selected={d.week} onSelect={pick}
          series={[{ key: "high", label: "High priority" }, { key: "other", label: "Medium or low priority" }]} />
      </Panel>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <WeekStepper weeks={d.weeks.map((w) => w.week_start)} value={d.week ?? ""} onChange={pick} label={(w) => weekLabel(d.weeks.find((x) => x.week_start === w) ?? { week_start: w })} />
      </div>
      <StatStrip items={[
        { label: "High priority", value: wk.high, note: "Check these first" },
        { label: "Zero reports", value: wk.zero_reports, note: wk.missing ? `plus ${wk.missing} missing reports` : "No missing reports" },
        { label: "Reviewed", value: `${wk.reviewed} of ${wk.zero_reports + wk.missing}`, note: "Leads with a recorded review" },
      ]} />

      <FilterBar activeCount={Object.values(f).filter(Boolean).length} onReset={() => { setF(DEF); setPage(1); }} label="More filters"
        primary={<ChipFilter label="Priority" value={band} onChange={(v) => { setBand(v); setPage(1); }}
          options={[{ value: "", label: "All" }, { value: "High", label: "High", count: wk.high, tone: "critical" as const }, { value: "Medium", label: "Medium", count: wk.medium }, { value: "Low", label: "Low", count: wk.low }, ...(wk.missing ? [{ value: MISSING, label: "Missing", count: wk.missing }] : [])]} />}>
        <FilterField label="Region" className="w-full md:w-64">{(id) => (
          <Select id={id} value={f.region} onChange={(e) => { setF({ ...f, region: e.target.value }); setPage(1); }}><option value="">All regions</option>{d.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        )}</FilterField>
        <ReviewFilter value={f.review} onChange={(v) => { setF({ ...f, review: v }); setPage(1); }} />
      </FilterBar>

      <Panel bodyClassName="p-0">
        <div className="px-4 py-2 md:p-0">
          <DataTable caption="Zero reports ranked for checking" rows={d.items} rowKey={(r) => r.alert_id} onRowClick={setOpen} minWidth={720}
            mobileTitle={(r) => <span>{r.rank_in_week ? `${r.rank_in_week}. ` : ""}{r.location_name}<span className="block text-xs font-normal text-ink-2">{r.region_name}</span></span>}
            emptyState={<EmptyState title="No zero reports match these filters" />}
            columns={[
              { key: "rank", header: "#", hideOnMobile: true, cell: (r) => <span className="text-ink-2 tabular">{r.rank_in_week ?? "—"}</span> },
              { key: "place", header: "Place", hideOnMobile: true, className: "min-w-[12rem]", cell: (r) => (
                <div><button type="button" className="text-left font-medium text-teal-900 hover:underline" onClick={() => setOpen(r)}>{r.location_name}</button><p className="text-xs text-ink-2">{r.region_name}</p></div>
              ) },
              { key: "band", header: "Priority", cell: (r) => <BandBadge band={r.priority} /> },
              { key: "why", header: "Main reason", className: "min-w-[14rem]", cell: (r) => <span className="text-[13px]">{r.top_indicators[0] ?? "—"}</span> },
              { key: "rev", header: "Review", cell: (r) => <ReviewBadge review={r.review} /> },
            ]} />
        </div>
      </Panel>
      {d.pages > 1 && <Pagination page={d.page} pages={d.pages} total={d.total} pageSize={d.page_size} onPage={setPage} />}
      {current && <Drawer open onOpenChange={(o) => !o && setOpen(null)} size="lg" title={current.location_name} description={`${current.region_name} · ${weekLabel(current)}`}>
        <ZeroDetail item={current} d={d} />
      </Drawer>}
    </div>
  );
}
