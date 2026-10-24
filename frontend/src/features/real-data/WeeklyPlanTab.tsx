import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Callout } from "@/components/ui/callout";
import { Drawer } from "@/components/ui/overlay";
import { KeyValue, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { api } from "@/services/api";
import type { PlanAction } from "@/types/api";
import { StatStrip, WeekBars, WeekStepper } from "./charts";
import { LeadReviewSection, ReviewBadge } from "./LeadReview";

function ActionDetail({ a }: { a: PlanAction }) {
  return (
    <div className="flex flex-col gap-5">
      <div><ReviewBadge review={a.review} /></div>
      <Callout variant="model-flag" by="Model B v2 plan">
        {a.action_label}. Takes about {fmtNum(a.hours, 1)} staff hours. Estimated gain: about {fmtNum(a.expected_cases_recovered, 1)} unreported cases on average, allowing for the chance that reporting was fine. Nothing is recovered until the check is made.
      </Callout>
      <KeyValue items={[
        { label: "Places covered", value: a.location_names.join(", ") },
        { label: "Cases reported vs expected", value: `${fmtNum(a.reported_cases)} vs about ${fmtNum(a.expected_cases, 0)}` },
        { label: "Highest chance a place's reporting failed", value: fmtPct(a.p_fail_max) },
        { label: "Chance the regional pathway failed", value: fmtPct(a.P_region) },
      ]} />
      <LeadReviewSection leadType="plan_action" leadId={a.lead_id} />
    </div>
  );
}

export function WeeklyPlanTab() {
  const [week, setWeek] = useState("");
  const [open, setOpen] = useState<PlanAction | null>(null);
  const q = useQuery({ queryKey: ["real", "plan", week], queryFn: () => api.realPlan(week || undefined), placeholderData: (p) => p });
  const d = q.data;
  const current = open && (d?.actions.find((a) => a.lead_id === open.lead_id) ?? open);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!d) return <Loading label="Loading the weekly plan" />;
  const reviewed = d.actions.filter((a) => a.review).length;
  return (
    <div className="flex flex-col gap-5">
      <Panel title="Unreported cases the plan's checks could recover, per week (model estimate)" description={`Each week the plan picks the checks with the largest estimated gain within ${fmtNum(d.hours_per_week)} staff hours. These are estimates, not cases actually recovered. Calls to a regional office rely on a simulated reporting network. Click a week to see its checks.`}>
        <WeekBars title="Expected cases recovered per week" data={d.weeks} selected={d.week} onSelect={setWeek} fmt={(v) => fmtNum(v, 1)}
          series={[{ key: "expected_cases_recovered", label: "Estimated cases recovered" }]} />
      </Panel>
      <WeekStepper weeks={d.weeks.map((w) => w.week_start)} value={d.week} onChange={setWeek} label={(w) => `Week of ${fmtDate(w)}`} />
      <StatStrip items={[
        { label: "Checks planned", value: d.actions.length },
        { label: "Staff hours", value: `${fmtNum(d.hours_used, 1)} of ${fmtNum(d.hours_per_week)}` },
        { label: "Reviewed", value: `${reviewed} of ${d.actions.length}` },
      ]} />
      {d.actions.length === 0 ? <EmptyState title="No checks planned for this week" /> : (
        <ol className="flex flex-col gap-2" aria-label="Planned checks, in order">
          {d.actions.map((a, i) => (
            <li key={a.lead_id}>
              <button type="button" onClick={() => setOpen(a)}
                className="flex w-full items-center gap-3 rounded-md border border-line bg-white px-4 py-3 text-left hover:border-teal-900">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-aqua-50 text-xs font-semibold text-teal-900 tabular" aria-hidden>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-teal-900">{a.target_name}</span>
                  <span className="block text-xs text-ink-2">{a.action_label} · {fmtNum(a.hours, 1)} h · est. {fmtNum(a.expected_cases_recovered, 1)} cases</span>
                </span>
                <ReviewBadge review={a.review} />
                <ChevronRight className="size-4 shrink-0 text-ink-2" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
      {current && <Drawer open onOpenChange={(o) => !o && setOpen(null)} size="lg" title={current.target_name} description={`${current.action_label} · week of ${fmtDate(d.week)}`}>
        <ActionDetail a={current} />
      </Drawer>}
    </div>
  );
}
