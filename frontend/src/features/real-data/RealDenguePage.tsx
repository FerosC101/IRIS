import { useSearchParams } from "react-router-dom";
import { PageHero } from "@/components/shell/PageHero";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { fmtDateTime } from "@/lib/format";
import { mergeSearch } from "@/lib/url";
import { useRealStatus } from "./LeadReview";
import { ModelAFlagsTab } from "./ModelAFlagsTab";
import { ResultsTab } from "./ResultsTab";
import { WeeklyPlanTab } from "./WeeklyPlanTab";
import { ZeroReportsTab } from "./ZeroReportsTab";

const TABS = [
  { value: "zero", label: "Zero reports" },
  { value: "flags", label: "Low counts" },
  { value: "plan", label: "Weekly plan" },
  { value: "results", label: "How well it works" },
];

export function RealDenguePage() {
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some((t) => t.value === sp.get("tab")) ? sp.get("tab")! : "zero";
  const st = useRealStatus();
  const o = st.data?.outputs;

  return (
    <>
      <PageHero section="reports" tour="real-hero" eyebrow="Real data · HDX / DOH dengue, 2016–2021" title="Real reports worth a second look."
        subtitle="Picked by two models from public Department of Health data. Each one is a lead to check, not a confirmed error." />
      {st.error ? <ErrorState error={st.error} onRetry={() => st.refetch()} /> : !st.data ? <Loading label="Checking model outputs" /> : !st.data.available ? (
        <EmptyState title="No model outputs yet">Run the pipeline in “models/pipeline” (python -m iris_pipeline all). The files are read from {st.data.contract_dir}.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          <details className="rounded-md bg-tint px-4 py-3 text-[13px] text-ink">
            <summary className="cursor-pointer text-xs font-semibold tracking-wide text-teal-800 uppercase">About this data</summary>
            <div className="mt-2 flex flex-col gap-1.5">
              <p>{st.data.source}</p>
              <p>These are real reports, kept apart from the simulated demo network used elsewhere in IRIS. Staff check each lead and record what they found.</p>
              {o?.zero_priority.disclaimer && <p className="text-ink-2">{o.zero_priority.disclaimer}</p>}
              <p className="text-xs text-ink-2">
                {o?.zero_priority.available && <>Model B run {o.zero_priority.run_id}. </>}
                {o?.alerts.available && <>Model A run {o.alerts.run_id}. </>}
                {o?.zero_priority.generated_at && <>Updated {fmtDateTime(o.zero_priority.generated_at)}.</>}
              </p>
            </div>
          </details>
          <Tabs value={tab} onValueChange={(v) => setSp((p) => mergeSearch(p, { tab: v === "zero" ? null : v }), { replace: true })}>
            <div data-tour="real-tabs"><TabsList label="Real-data views" tabs={TABS} /></div>
            <TabsContent value="zero"><ZeroReportsTab /></TabsContent>
            <TabsContent value="flags"><ModelAFlagsTab /></TabsContent>
            <TabsContent value="plan"><WeeklyPlanTab /></TabsContent>
            <TabsContent value="results"><ResultsTab /></TabsContent>
          </Tabs>
        </div>
      )}
    </>
  );
}
