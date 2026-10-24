import type { ReactNode } from "react";
import { EvidenceKindBadge } from "@/components/data-display/badges";
import { PageHeader } from "@/components/data-display/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { useSession } from "@/hooks/useSession";
import { ASSIGNMENT_STATUS, CONCERN_STATUS, EVIDENCE_KIND, VALUE_STATUS } from "@/lib/labels";
import type { EvidenceKind } from "@/types/api";

function DL({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="flex flex-col divide-y divide-line">
      {items.map(([t, d], i) => (
        <div key={i} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[14rem_1fr] sm:gap-4">
          <dt className="text-sm font-medium text-ink">{t}</dt>
          <dd className="text-sm text-ink">{d}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HelpPage() {
  const { meta } = useSession();
  return (
    <>
      <PageHeader title="Help" description="What the words and numbers in IRIS mean." />
      <nav aria-label="On this page" className="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {[["glossary", "Glossary"], ["statuses", "Status labels"], ["metrics", "Metrics"], ["methods", "Detection methods"], ["planning", "Intervention planning"], ["limitations", "Limitations"]].map(([id, l]) => (
          <a key={id} href={`#${id}`} className="font-medium text-teal-900 hover:underline">{l}</a>
        ))}
      </nav>
      <div className="flex flex-col gap-5">
        <Panel id="glossary" title="Glossary">
          <DL items={[
            ["Reporting unit", "A facility that submits reports: a Rural Health Unit (RHU), hospital or laboratory. In this demo all units are simulated."],
            ["Reporting hub", "A simulated point through which several units submit their reports (for example a provincial office)."],
            ["Expected reports", "The reports a unit should submit, defined by its reporting schedule (category and frequency). Missing reports can only be counted when expected reports are defined."],
            ["Late report", "A report received after its due date (weekly: Tuesday 17:00 after the reporting week; monthly: the 5th of the next month)."],
            ["Missing / not received", "An expected report that had not arrived when the week was reviewed (seven days after the due date) or by the dataset snapshot."],
            ["Blank versus zero", <>A <em>zero</em> is an explicit report of no cases. A <em>blank</em> is a field left empty. IRIS never treats a blank as zero.</>],
            ["Possible shared problem", "Several connected units (same hub or shared resource) had delays at the same time. It suggests, but does not prove, a common cause."],
            ["Unexpected drop in counts", "Reported cases much lower than the unit's recent weeks while reports were still being received. It may reflect under-reporting, a data-entry error or a genuine decline."],
            ["Concern", "A flagged reporting issue that needs review. Concerns are created by detection runs and closed by a person."],
            ["Recommended next step", "A suggestion based on the concern type and status. IRIS never acts automatically."],
          ]} />
        </Panel>
        <Panel id="statuses" title="Status labels">
          <h3 className="mb-1 text-sm font-semibold">Concern status</h3>
          <DL items={Object.values(CONCERN_STATUS).map((s) => [<Badge tone={s.tone}>{s.label}</Badge>, s.help])} />
          <h3 className="mt-4 mb-1 text-sm font-semibold">Evidence labels</h3>
          <DL items={(Object.keys(EVIDENCE_KIND) as EvidenceKind[]).map((k) => [<EvidenceKindBadge kind={k} />, EVIDENCE_KIND[k].help])} />
          <h3 className="mt-4 mb-1 text-sm font-semibold">Value status</h3>
          <DL items={Object.values(VALUE_STATUS).map((v) => [v.label, v.help])} />
          <h3 className="mt-4 mb-1 text-sm font-semibold">Follow-up action status</h3>
          <DL items={[
            ...Object.values(ASSIGNMENT_STATUS).map((s) => [<Badge tone={s.tone}>{s.label}</Badge>, ""] as [ReactNode, ReactNode]),
            ["Outcome not yet verified", "The action was completed but nobody has checked whether reporting improved."],
            ["Outcome observed (unverified)", "A change was seen in the data, but a reviewer has not confirmed it or its cause."],
            ["Outcome verified by reviewer", "A coordinator or analyst explicitly recorded the outcome as verified."],
            ["Simulated outcome", "The outcome was produced by the demo storyline, not by real reporting."],
          ]} />
        </Panel>
        <Panel id="metrics" title="Metrics">
          <DL items={[
            ["Arrived (completeness)", "Expected reports that arrived ÷ all expected reports. Not calculable when a dataset defines no reporting schedule."],
            ["On time (timeliness)", "Expected reports that arrived by the due date ÷ all expected reports. Requires due dates and received timestamps."],
            ["Delay share (detection)", "(½ × late reports + reports not received) ÷ expected reports, for one unit in one week."],
            ["Precision", "Of the unit-weeks a method flagged, the share that were truly disrupted in the simulation."],
            ["Recall", "Of the truly disrupted unit-weeks, the share the method flagged."],
            ["False-alarm rate", "Of the undisrupted unit-weeks, the share the method flagged."],
            ["Detection delay", "Weeks from the start of a disruption to the method's first flag for that unit."],
            ["95% CI", "Wilson score interval for a proportion. It describes sampling uncertainty only, not bias."],
          ]} />
        </Panel>
        <Panel id="methods" title="Detection methods">
          <DL items={[
            [meta?.labels.method.threshold ?? "Statistical threshold", "Compares the week's delay share with the unit's previous eight weeks (median and a robust spread; at least six weeks needed, otherwise a network-wide default is used). Flags when the robust z-score is ≥ 3 and the delay share ≥ 30%."],
            [meta?.labels.method.ewma ?? "Time-series", "An exponentially weighted moving average (λ = 0.5) of the delay share, compared with the same baseline. Catches sustained shifts and ignores many one-off late weeks, but can stay elevated just after a problem ends."],
            [meta?.labels.method.network ?? "Network-aware", "The threshold z-score plus 3 × the share of connected units (same hub or shared resource) that were also delayed. Flags at a combined score ≥ 4.5, and only with some delay of the unit's own. Only relationships defined in the selected dataset are used."],
            ["Shared checks", "All methods also flag incomplete records (≥ 50% of received reports with blank or incomplete fields) and count drops (Poisson lower-tail probability < 0.001 versus recent weeks, only when most reports arrived)."],
            ["Scores", "Scores describe how unusual a pattern is. They are not probabilities and do not prove a reporting failure."],
          ]} />
        </Panel>
        <Panel id="planning" title="Intervention planning">
          <DL items={[
            ["Assumed benefit", "Expected weekly reports at the affected units × planning horizon × assumed success probability, in report-weeks. An illustrative simulation assumption."],
            ["Optimized plan", "Exact budget-constrained selection (multiple-choice knapsack) that maximizes assumed benefit and respects dependencies."],
            ["Baseline plan", "Takes actions in priority order (concern severity) while they fit the budget."],
            ["Approval", "Approving a plan creates follow-up actions. No facility is contacted and nothing happens outside the prototype."],
          ]} />
        </Panel>
        <Panel id="limitations" title="Prototype and data limitations">
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>IRIS is a research prototype. It is not an officially deployed Department of Health system and is not endorsed by any government agency.</li>
            <li>All demonstration data, places, facilities, people and relationships are simulated. Province and municipality names are fictional.</li>
            <li>No real patient information is used. The demo contains only aggregate simulated counts.</li>
            <li>Detection thresholds and planning assumptions were set for the simulation; they have not been validated on real surveillance data.</li>
            <li>Evaluation results come from synthetic scenarios with known answers and may not reflect real-world performance.</li>
            <li>Before/after comparisons show association, not causation.</li>
            <li>The demo role selector is not authentication. Anyone can act as any role.</li>
            <li>Data is stored in a local SQLite file; staged CSV uploads are kept in server memory and are lost if the server restarts.</li>
            <li>Imported data is labelled with the origin the importer declares; IRIS does not verify it.</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
