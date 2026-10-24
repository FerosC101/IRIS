import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/data-display/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
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
  { value: "flags", label: "Low counts (Model A)" },
  { value: "plan", label: "Weekly plan" },
  { value: "results", label: "Model results" },
];

export function RealDenguePage() {
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some((t) => t.value === sp.get("tab")) ? sp.get("tab")! : "zero";
  const st = useRealStatus();
  const o = st.data?.outputs;
  const zero = o?.zero_priority;

  return (
    <>
      <PageHeader title="Real dengue data" description="Model A and Model B run on real Department of Health dengue reports. Every item is a lead to verify, not a confirmed error."
        meta={<>
          <Badge tone="teal">Real data · HDX / DOH</Badge>
          {zero?.available && <Badge>Model B run {zero.run_id}</Badge>}
          {o?.alerts.available && <Badge>Model A run {o.alerts.run_id}</Badge>}
          {zero?.generated_at && <span className="text-xs text-ink-2">Updated {fmtDateTime(zero.generated_at)}</span>}
        </>} />
      {st.error ? <ErrorState error={st.error} onRetry={() => st.refetch()} /> : !st.data ? <Loading label="Checking model outputs" /> : !st.data.available ? (
        <EmptyState title="No model outputs yet">Run the pipeline in “Model A/pipeline” (python -m iris_pipeline all). The files are read from {st.data.contract_dir}.</EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          <Callout variant="info" label="About this data">
            <p>{st.data.source}</p>
            <p className="mt-1">These are real reports, kept apart from the simulated demo network used elsewhere in IRIS. Staff check each lead and record what they found.</p>
            {zero?.disclaimer && <p className="mt-1 text-xs text-ink-2">{zero.disclaimer}</p>}
          </Callout>
          <Tabs value={tab} onValueChange={(v) => setSp((p) => mergeSearch(p, { tab: v === "zero" ? null : v }), { replace: true })}>
            <TabsList label="Real-data views" tabs={TABS} />
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
