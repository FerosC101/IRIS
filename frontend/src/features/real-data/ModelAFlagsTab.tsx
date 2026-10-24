import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DataTable } from "@/components/data-display/DataTable";
import { ChipFilter, FilterBar, FilterField } from "@/components/data-display/FilterBar";
import { Callout } from "@/components/ui/callout";
import { Select } from "@/components/ui/form";
import { Drawer } from "@/components/ui/overlay";
import { Pagination } from "@/components/ui/pagination";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { api } from "@/services/api";
import type { ModelAAlert } from "@/types/api";
import { RangeMarker, StatStrip, WeekBars } from "./charts";
import { fmtChance } from "./format";
import { LeadReviewSection, ReviewBadge } from "./LeadReview";
import { ReviewFilter } from "./ZeroReportsTab";

function AlertDetail({ a }: { a: ModelAAlert }) {
  return (
    <div className="flex flex-col gap-5">
      <div><ReviewBadge review={a.review} /></div>
      <p className="text-[15px] leading-relaxed">
        Reported <strong>{fmtNum(a.cases)}</strong> case{a.cases === 1 ? "" : "s"} (observed), well below the range Model A expected for this place and time of year.
        If reporting were normal, a count this low would happen {fmtChance(a.p_low)} of the time.
      </p>
      <RangeMarker reported={a.cases} expected={a.expected} low={a.pi_low} high={a.pi_high} />
      <Callout variant="model-flag" by="Model A">
        Model A's estimate that reporting failed this week: {a.p_fail == null ? "not estimated" : fmtPct(a.p_fail)} (not validated as a probability). Expected minus reported: {a.shortfall == null ? "—" : `${fmtNum(a.shortfall, 1)} cases`}.
        The model cannot say why the count is low.
      </Callout>
      <LeadReviewSection leadType="model_a_alert" leadId={a.alert_id} />
    </div>
  );
}

export function ModelAFlagsTab() {
  const DEF = { region: "", review: "" };
  const [year, setYear] = useState("");
  const [f, setF] = useState(DEF);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ModelAAlert | null>(null);
  // No year: the backend shows the latest one. "all" shows every year.
  const q = useQuery({ queryKey: ["real", "alerts", year, f, page], queryFn: () => api.realAlerts({ ...f, year, page, page_size: 15 }), placeholderData: (p) => p });
  const d = q.data;
  const shownYear = d?.year ?? "all";
  const current = open && (d?.items.find((i) => i.alert_id === open.alert_id) ?? open);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!d) return <Loading label="Loading Model A flags" />;
  const reviewed = d.items.filter((i) => i.review).length;
  return (
    <div className="flex flex-col gap-5">
      <ChipFilter label="Year" value={shownYear} onChange={(v) => { setYear(v); setPage(1); }}
        options={[...d.years.map((y) => ({ value: String(y), label: String(y) })), { value: "all", label: "All years" }]} />
      <Panel title="Low dengue counts flagged by Model A, per week" description="Places whose reported weekly count was far below what Model A expected from their own history and season. The threshold is set so about 1 in 100 normal weeks would be flagged by chance.">
        <WeekBars title="Model A flags per week" data={d.weekly} series={[{ key: "flags", label: "Places flagged" }]} />
      </Panel>
      <StatStrip items={[
        { label: "Flags", value: fmtNum(d.total), note: shownYear === "all" ? "All years" : `In ${shownYear}` },
        { label: "Weeks with a flag", value: d.weekly.length },
        { label: "Reviewed on this page", value: `${reviewed} of ${d.items.length}` },
      ]} />
      <FilterBar activeCount={Object.values(f).filter(Boolean).length} onReset={() => { setF(DEF); setPage(1); }} label="More filters">
        <FilterField label="Region" className="w-full md:w-64">{(id) => <Select id={id} value={f.region} onChange={(e) => { setF({ ...f, region: e.target.value }); setPage(1); }}><option value="">All regions</option>{d.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}</FilterField>
        <ReviewFilter value={f.review} onChange={(v) => { setF({ ...f, review: v }); setPage(1); }} />
      </FilterBar>
      <Panel bodyClassName="p-0">
        <div className="px-4 py-2 md:p-0">
          <DataTable caption="Model A flags, newest first" rows={d.items} rowKey={(r) => r.alert_id} onRowClick={setOpen} minWidth={680}
            mobileTitle={(r) => r.location_name} emptyState={<EmptyState title="No flags match these filters" />}
            columns={[
              { key: "wk", header: "Week of", cell: (r) => fmtDate(r.period_start) },
              { key: "place", header: "Place", hideOnMobile: true, className: "min-w-[12rem]", cell: (r) => (
                <div><button type="button" className="text-left font-medium text-teal-900 hover:underline" onClick={() => setOpen(r)}>{r.location_name}</button>{r.region_name && <p className="text-xs text-ink-2">{r.region_name}</p>}</div>
              ) },
              { key: "rep", header: "Reported vs expected cases", cell: (r) => <span className="tabular">{fmtNum(r.cases)} <span className="text-ink-2">vs about {fmtNum(r.expected, 0)} expected</span></span> },
              { key: "rev", header: "Review", cell: (r) => <ReviewBadge review={r.review} /> },
            ]} />
        </div>
      </Panel>
      {d.pages > 1 && <Pagination page={d.page} pages={d.pages} total={d.total} pageSize={d.page_size} onPage={setPage} />}
      {current && <Drawer open onOpenChange={(o) => !o && setOpen(null)} size="lg" title={current.location_name} description={`Low count · week of ${fmtDate(current.period_start)}`}>
        <AlertDetail a={current} />
      </Drawer>}
    </div>
  );
}
