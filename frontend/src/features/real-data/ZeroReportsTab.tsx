import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { DataTable } from "@/components/data-display/DataTable";
import { ChipFilter, FilterBar, FilterField } from "@/components/data-display/FilterBar";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Select } from "@/components/ui/form";
import { Drawer } from "@/components/ui/overlay";
import { Pagination } from "@/components/ui/pagination";
import { KeyValue, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import type { Tone } from "@/lib/labels";
import { api } from "@/services/api";
import type { ZeroBand, ZeroReportItem, ZeroReports } from "@/types/api";
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

const weekLabel = (w: { week_start: string; mw?: number | null; mw_year?: number | null }) =>
  `${w.mw ? `MW ${w.mw} ${w.mw_year} · ` : ""}week of ${fmtDate(w.week_start)}`;

function ZeroDetail({ item, d }: { item: ZeroReportItem; d: ZeroReports }) {
  const used = Object.entries(d.model.weights).filter(([, w]) => w > 0).map(([k]) => k);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2"><BandBadge band={item.priority} /><ReviewBadge review={item.review} /></div>
      {item.report_status === "missing" ? (
        <Callout variant="info" label="Missing report">No report was received for this week. A missing submission is not a zero report, so it is listed but not ranked.</Callout>
      ) : (
        <>
          <KeyValue items={[
            { label: "Week", value: weekLabel(item) },
            { label: "Reported cases", value: fmtNum(item.cases) },
            { label: "Model A expected", value: `about ${fmtNum(item.expected, 1)} cases` },
            { label: "Chance of a count this low", value: fmtChance(item.p_low) },
            { label: "Priority score", value: `${fmtNum(item.priority_score, 1)} / 100 · rank ${item.rank_in_week} this week` },
            { label: "Chance it is a reporting problem", value: item.p_priority == null ? "—" : `${fmtPct(item.p_priority)} (range ${fmtPct(item.p_priority_low)}–${fmtPct(item.p_priority_high)})` },
            { label: "History available", value: item.data_sufficiency ?? "—" },
            { label: "Model A flag", value: item.model_a_flag ? "Yes, Model A also flagged this week" : "No" },
          ]} />
          <Callout variant="model-flag" by="Model B · zero-report prioritizer">
            <p>{item.explanation}</p>
            {item.top_indicators.length > 0 && <p className="mt-1 text-xs">Main reasons: {item.top_indicators.join("; ")}.</p>}
          </Callout>
          <section aria-label="Indicators">
            <h3 className="mb-2 text-sm font-semibold">Indicators (0 = no sign, 1 = strong sign)</h3>
            <ul className="flex flex-col gap-1.5">
              {Object.entries(item.components).map(([k, v]) => (
                <li key={k} className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] items-center gap-2 text-[13px]">
                  <span>{d.indicator_labels[k] ?? k}{used.includes(k) ? <span className="ml-1 text-xs font-semibold text-teal-800">· in the score</span> : <span className="ml-1 text-xs text-ink-2">· shown for context</span>}</span>
                  <span className="h-2 rounded-full bg-porcelain" aria-hidden><span className="block h-2 rounded-full bg-teal-800" style={{ width: `${Math.round(v * 100)}%` }} /></span>
                  <span className="text-right tabular">{v.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      {item.data_warnings.length > 0 && (
        <Callout variant="info" label="Limits of the data"><ul className="list-disc pl-4">{item.data_warnings.map((w) => <li key={w}>{w}</li>)}</ul></Callout>
      )}
      {item.verification_steps.length > 0 && (
        <section aria-label="How to verify">
          <h3 className="mb-2 text-sm font-semibold">How to verify</h3>
          <ol className="list-decimal pl-5 text-[13px] leading-relaxed">{item.verification_steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </section>
      )}
      <LeadReviewSection leadType="zero_report" leadId={item.alert_id} />
    </div>
  );
}

export function ZeroReportsTab() {
  // Filters start open on larger screens; on phones they are a sheet, opened on demand.
  const md = useIsMdUp();
  const DEF = { week: "", band: "", region: "", review: "" };
  const [f, setF] = useState(DEF);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ZeroReportItem | null>(null);
  const set = (patch: Partial<typeof DEF>) => { setF({ ...f, ...patch }); setPage(1); };
  const q = useQuery({ queryKey: ["real", "zero", f, page], queryFn: () => api.realZeroReports({ ...f, page, page_size: 25 }), placeholderData: (p) => p });
  const d = q.data;
  const wk = d?.weeks.find((w) => w.week_start === d.week);
  // Fresh copy after a review; the row may leave the filtered list, so fall back to the one that was opened.
  const current = open && (d?.items.find((i) => i.alert_id === open.alert_id) ?? open);
  const active = Object.entries(f).filter(([k, v]) => k !== "band" && v !== "").length;

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!d) return <Loading label="Loading zero reports" />;
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-2">Each week, places that reported zero dengue cases are ranked by how likely the zero hides a reporting problem. Start at the top and verify; the model cannot tell why a zero was reported.</p>
      <FilterBar activeCount={active} onReset={() => { setF(DEF); setPage(1); }} label="Zero-report filters" defaultOpen={md}
        primary={<ChipFilter label="Priority" value={f.band} onChange={(v) => set({ band: v })}
          options={[{ value: "", label: "All" }, { value: "High", label: "High", count: wk?.high, tone: "critical" as const }, { value: "Medium", label: "Medium" }, { value: "Low", label: "Low" }, { value: MISSING, label: "Missing reports", count: wk?.missing }]} />}>
        <FilterField label="Week" className="w-full md:w-[26rem]">{(id) => (
          <Select id={id} value={f.week || d.week || ""} onChange={(e) => set({ week: e.target.value })}>
            {[...d.weeks].reverse().map((w) => <option key={w.week_start} value={w.week_start}>{weekLabel(w)} ({w.zero_reports} zero, {w.high} high)</option>)}
          </Select>
        )}</FilterField>
        <FilterField label="Region" className="w-full md:w-64">{(id) => (
          <Select id={id} value={f.region} onChange={(e) => set({ region: e.target.value })}><option value="">All regions</option>{d.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        )}</FilterField>
        <ReviewFilter value={f.review} onChange={(v) => set({ review: v })} />
      </FilterBar>
      {wk && <p className="text-[13px] text-ink-2">{weekLabel(wk)}: {wk.zero_reports} zero reports, {wk.high} high priority, {wk.missing} missing reports, {wk.reviewed} reviewed.</p>}
      <Panel bodyClassName="p-0">
        <div className="px-4 py-2 md:p-0">
          <DataTable caption="Zero reports ranked for verification" rows={d.items} rowKey={(r) => r.alert_id} onRowClick={setOpen} minWidth={900}
            mobileTitle={(r) => <span>{r.rank_in_week ? `${r.rank_in_week}. ` : ""}{r.location_name}<span className="block text-xs font-normal text-ink-2">{r.region_name}</span></span>}
            emptyState={<EmptyState title="No zero reports match these filters" />}
            columns={[
              { key: "rank", header: "Rank", hideOnMobile: true, cell: (r) => <span className="tabular">{r.rank_in_week ?? "—"}</span> },
              { key: "place", header: "Place", hideOnMobile: true, className: "min-w-[12rem]", cell: (r) => (
                <div><button type="button" className="text-left font-medium text-teal-900 hover:underline" onClick={() => setOpen(r)}>{r.location_name}</button><p className="text-xs text-ink-2">{r.region_name}</p></div>
              ) },
              { key: "band", header: "Priority", cell: (r) => <div className="flex flex-col items-start gap-0.5"><BandBadge band={r.priority} />{r.priority_score != null && <span className="text-xs text-ink-2 tabular">score {fmtNum(r.priority_score, 0)}</span>}</div> },
              { key: "exp", header: "Expected cases", align: "right", cell: (r) => (r.expected == null ? "—" : fmtNum(r.expected, 1)) },
              { key: "plow", header: "Chance of zero", align: "right", cell: (r) => fmtChance(r.p_low) },
              { key: "why", header: "Main reasons", className: "min-w-[14rem]", cell: (r) => <span className="text-[13px]">{r.top_indicators.join("; ") || "—"}</span> },
              { key: "rev", header: "Review", cell: (r) => <ReviewBadge review={r.review} /> },
            ]} />
        </div>
      </Panel>
      <Pagination page={d.page} pages={d.pages} total={d.total} pageSize={d.page_size} onPage={setPage} />
      {current && <Drawer open onOpenChange={(o) => !o && setOpen(null)} size="lg" title={`${current.location_name} · zero report`} description={`${current.region_name} · week of ${fmtDate(current.week_start)}`}>
        <ZeroDetail item={current} d={d} />
      </Drawer>}
    </div>
  );
}
