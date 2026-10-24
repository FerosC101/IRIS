import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { DataTable } from "@/components/data-display/DataTable";
import { FilterBar, FilterField } from "@/components/data-display/FilterBar";
import { Callout } from "@/components/ui/callout";
import { Select } from "@/components/ui/form";
import { Drawer } from "@/components/ui/overlay";
import { KeyValue, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { api } from "@/services/api";
import type { PlanAction } from "@/types/api";
import { LeadReviewSection, ReviewBadge } from "./LeadReview";

function ActionDetail({ a }: { a: PlanAction }) {
  return (
    <div className="flex flex-col gap-4">
      <div><ReviewBadge review={a.review} /></div>
      <Callout variant="model-flag" by="Model B v2 · weekly plan">
        {a.action_label}: {a.target_name}. Planned {fmtNum(a.hours, 1)} staff hours, expected to recover about {fmtNum(a.expected_cases_recovered, 1)} unreported cases on average, allowing for the chance that reporting was fine.
      </Callout>
      <KeyValue items={[
        { label: "Region", value: a.region_name ?? a.region_id },
        { label: "Places covered", value: a.location_names.join(", ") },
        { label: "Cases reported", value: fmtNum(a.reported_cases) },
        { label: "Cases expected", value: fmtNum(a.expected_cases, 1) },
        { label: "Possible missing cases", value: fmtNum(a.shortfall, 1) },
        { label: "Missing reports", value: fmtNum(a.missing_reports) },
        { label: "Highest chance a place's reporting failed", value: fmtPct(a.p_fail_max) },
        { label: "Chance the regional pathway failed", value: fmtPct(a.P_region) },
      ]} />
      <LeadReviewSection leadType="plan_action" leadId={a.lead_id} />
    </div>
  );
}

export function WeeklyPlanTab() {
  // Filters start open on larger screens; on phones they are a sheet, opened on demand.
  const md = useIsMdUp();
  const [week, setWeek] = useState("");
  const [open, setOpen] = useState<PlanAction | null>(null);
  const q = useQuery({ queryKey: ["real", "plan", week], queryFn: () => api.realPlan(week || undefined), placeholderData: (p) => p });
  const d = q.data;
  const current = open && (d?.actions.find((a) => a.lead_id === open.lead_id) ?? open);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!d) return <Loading label="Loading the weekly plan" />;
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-2">The checks to make this week within {fmtNum(d.hours_per_week)} staff hours, chosen to recover the most unreported cases. When several places in a region look affected, one call to the regional office comes first.</p>
      <FilterBar activeCount={week ? 1 : 0} onReset={() => setWeek("")} label="Plan week" defaultOpen={md}>
        <FilterField label="Week" className="w-full md:w-72">{(id) => (
          <Select id={id} value={week || d.week} onChange={(e) => setWeek(e.target.value)}>
            {[...d.weeks].reverse().map((w) => <option key={w.week_start} value={w.week_start}>Week of {fmtDate(w.week_start)} ({w.actions} actions)</option>)}
          </Select>
        )}</FilterField>
      </FilterBar>
      <Panel variant="secondary"><KeyValue columns={3} items={[
        { label: "Week", value: `week of ${fmtDate(d.week)}` },
        { label: "Staff hours planned", value: `${fmtNum(d.hours_used, 1)} of ${fmtNum(d.hours_per_week)}` },
        { label: "Cases expected to be recovered", value: d.expected_cases_recovered == null ? "—" : fmtNum(d.expected_cases_recovered, 1) },
      ]} /></Panel>
      <Panel bodyClassName="p-0">
        <div className="px-4 py-2 md:p-0">
          <DataTable caption="Planned verification actions" rows={d.actions} rowKey={(r) => r.lead_id} onRowClick={setOpen} minWidth={860}
            mobileTitle={(r) => r.target_name} emptyState={<EmptyState title="No actions planned for this week" />}
            columns={[
              { key: "act", header: "Action", hideOnMobile: true, className: "min-w-[14rem]", cell: (r) => (
                <div><button type="button" className="text-left font-medium text-teal-900 hover:underline" onClick={() => setOpen(r)}>{r.target_name}</button><p className="text-xs text-ink-2">{r.action_label}</p></div>
              ) },
              { key: "places", header: "Places", className: "min-w-[12rem]", cell: (r) => <span className="text-[13px]">{r.location_names.slice(0, 3).join(", ")}{r.location_names.length > 3 ? ` +${r.location_names.length - 3}` : ""}</span> },
              { key: "h", header: "Hours", align: "right", cell: (r) => fmtNum(r.hours, 1) },
              { key: "rec", header: "Cases recovered (expected)", align: "right", cell: (r) => fmtNum(r.expected_cases_recovered, 1) },
              { key: "rev", header: "Review", cell: (r) => <ReviewBadge review={r.review} /> },
            ]} />
        </div>
      </Panel>
      {current && <Drawer open onOpenChange={(o) => !o && setOpen(null)} size="lg" title={current.target_name} description={`${current.action_label} · week of ${fmtDate(d.week)}`}>
        <ActionDetail a={current} />
      </Drawer>}
    </div>
  );
}
