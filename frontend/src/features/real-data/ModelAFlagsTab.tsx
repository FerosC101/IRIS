import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { DataTable } from "@/components/data-display/DataTable";
import { FilterBar, FilterField } from "@/components/data-display/FilterBar";
import { Callout } from "@/components/ui/callout";
import { Select } from "@/components/ui/form";
import { Drawer } from "@/components/ui/overlay";
import { Pagination } from "@/components/ui/pagination";
import { KeyValue, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { api } from "@/services/api";
import type { ModelAAlert } from "@/types/api";
import { fmtChance } from "./format";
import { LeadReviewSection, ReviewBadge } from "./LeadReview";
import { ReviewFilter } from "./ZeroReportsTab";

function AlertDetail({ a }: { a: ModelAAlert }) {
  return (
    <div className="flex flex-col gap-4">
      <div><ReviewBadge review={a.review} /></div>
      <Callout variant="model-flag" by="Model A v2 · count model">
        Reported {fmtNum(a.cases)} case{a.cases === 1 ? "" : "s"}; the model expected about {fmtNum(a.expected, 1)} (90% range {fmtNum(a.pi_low)}–{fmtNum(a.pi_high)}).
        If reporting were normal, a count this low would happen with chance {fmtChance(a.p_low)}. The model cannot say why the count is low.
      </Callout>
      <KeyValue items={[
        { label: "Week", value: `week of ${fmtDate(a.period_start)}` },
        { label: "Place", value: `${a.location_name}${a.region_name ? ` · ${a.region_name}` : ""}` },
        { label: "Chance reporting failed", value: a.p_fail == null ? "—" : fmtPct(a.p_fail) },
        { label: "Possible missing cases", value: a.shortfall == null ? "—" : fmtNum(a.shortfall, 1) },
        { label: "Chance the regional hub failed", value: a.hub_p == null ? "—" : fmtPct(a.hub_p) },
        { label: "Priority (missing cases × chance)", value: fmtNum(a.priority, 1) },
        { label: "Model version", value: a.model_version },
      ]} />
      <LeadReviewSection leadType="model_a_alert" leadId={a.alert_id} />
    </div>
  );
}

export function ModelAFlagsTab() {
  // Filters start open on larger screens; on phones they are a sheet, opened on demand.
  const md = useIsMdUp();
  const DEF = { disease: "dengue", year: "", region: "", review: "" };
  const [f, setF] = useState(DEF);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ModelAAlert | null>(null);
  const set = (patch: Partial<typeof DEF>) => { setF({ ...f, ...patch }); setPage(1); };
  const q = useQuery({ queryKey: ["real", "alerts", f, page], queryFn: () => api.realAlerts({ ...f, page, page_size: 25 }), placeholderData: (p) => p });
  const d = q.data;
  const current = open && (d?.items.find((i) => i.alert_id === open.alert_id) ?? open);
  const active = Object.entries(f).filter(([k, v]) => v !== DEF[k as keyof typeof DEF]).length;

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!d) return <Loading label="Loading Model A flags" />;
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-2">Weeks where a place reported far fewer cases than Model A expected from its own history, season and trend. About 1 in 100 normal weeks would be flagged by chance.</p>
      <FilterBar activeCount={active} onReset={() => { setF(DEF); setPage(1); }} label="Flag filters" defaultOpen={md}>
        {d.diseases.length > 1 && <FilterField label="Disease">{(id) => <Select id={id} value={f.disease} onChange={(e) => set({ ...DEF, disease: e.target.value })}>{d.diseases.map((x) => <option key={x}>{x}</option>)}</Select>}</FilterField>}
        <FilterField label="Year">{(id) => <Select id={id} value={f.year} onChange={(e) => set({ year: e.target.value })}><option value="">All years</option>{d.years.map((y) => <option key={y} value={y}>{y}</option>)}</Select>}</FilterField>
        <FilterField label="Region" className="w-full md:w-64">{(id) => <Select id={id} value={f.region} onChange={(e) => set({ region: e.target.value })}><option value="">All regions</option>{d.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}</FilterField>
        <ReviewFilter value={f.review} onChange={(v) => set({ review: v })} />
      </FilterBar>
      <Panel bodyClassName="p-0">
        <div className="px-4 py-2 md:p-0">
          <DataTable caption="Model A flags, newest first" rows={d.items} rowKey={(r) => r.alert_id} onRowClick={setOpen} minWidth={900}
            mobileTitle={(r) => r.location_name} emptyState={<EmptyState title="No flags match these filters" />}
            columns={[
              { key: "wk", header: "Week of", cell: (r) => fmtDate(r.period_start) },
              { key: "place", header: "Place", hideOnMobile: true, className: "min-w-[12rem]", cell: (r) => (
                <div><button type="button" className="text-left font-medium text-teal-900 hover:underline" onClick={() => setOpen(r)}>{r.location_name}</button>{r.region_name && <p className="text-xs text-ink-2">{r.region_name}</p>}</div>
              ) },
              { key: "rep", header: "Reported", align: "right", cell: (r) => fmtNum(r.cases) },
              { key: "exp", header: "Expected (90% range)", align: "right", cell: (r) => <span className="tabular">{fmtNum(r.expected, 1)} ({fmtNum(r.pi_low)}–{fmtNum(r.pi_high)})</span> },
              { key: "pf", header: "Chance reporting failed", align: "right", cell: (r) => (r.p_fail == null ? "—" : fmtPct(r.p_fail)) },
              { key: "pr", header: "Priority", align: "right", cell: (r) => fmtNum(r.priority, 1) },
              { key: "rev", header: "Review", cell: (r) => <ReviewBadge review={r.review} /> },
            ]} />
        </div>
      </Panel>
      <Pagination page={d.page} pages={d.pages} total={d.total} pageSize={d.page_size} onPage={setPage} />
      {current && <Drawer open onOpenChange={(o) => !o && setOpen(null)} size="lg" title={`${current.location_name} · low count`} description={`Model A flag · week of ${fmtDate(current.period_start)}`}>
        <AlertDetail a={current} />
      </Drawer>}
    </div>
  );
}
