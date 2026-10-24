import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { MetricCard } from "@/components/data-display/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { fmtNum, fmtPct } from "@/lib/format";
import type { ImportValidation } from "@/types/api";
import { validationMetrics } from "./validation-summary";

export function ValidationFindings({ validation, children, pending }: { validation: ImportValidation; children?: ReactNode; pending?: boolean }) {
  const metrics = validationMetrics(validation);
  const issues = [...validation.errors.map((issue) => ({ ...issue, severity: "Error" as const })), ...validation.warnings.map((issue) => ({ ...issue, severity: "Warning" as const }))];
  const summary = validation.summary;
  return (
    <section aria-label="Validation results" aria-busy={pending} className="iris-workspace-stack">
      <div className="iris-validation-metrics grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Accepted Records" value={fmtNum(metrics.accepted)} detail={metrics.accepted === null ? "Unavailable until the complete file passes validation." : "Ready for import after provenance and confirmation."} motif="records" />
        <MetricCard label="Warnings" value={fmtNum(metrics.warnings)} detail="Warnings returned by the validator; review the findings below." motif="trends" />
        <MetricCard label="Rejected Records" value={fmtNum(metrics.rejected)} detail={metrics.rejected === null ? "A row total is unavailable for file-level or truncated errors." : "Distinct rows with errors. The complete file must pass before import."} motif="verify" />
      </div>
      <Panel title="Validation findings" description={`${fmtNum(validation.error_count)} validation error(s) · ${fmtNum(validation.errors.length)} error details returned.`} motif="verify" className="iris-records-table" bodyClassName="p-0">
        <div className="border-b border-line p-4">
          {validation.can_accept ? <p className="flex items-center gap-2 text-sm font-medium text-positive-ink"><CheckCircle2 className="size-4 shrink-0" aria-hidden />The file passed validation{validation.warnings.length ? " with warnings" : ""}.</p> : <p role="alert" className="text-sm text-critical-ink">The file cannot be imported yet. Correct the source file or change the mapping, then validate again. No records have been accepted.</p>}
        </div>
        {issues.length ? (
          <div className="max-h-96 overflow-auto" role="region" aria-label="Validation issue details" tabIndex={0}>
            <table className="w-full min-w-[34rem] text-left text-[13px]">
              <caption className="sr-only">Validation issues by severity, source row, column, and message</caption>
              <thead className="sticky top-0 bg-brand-surface"><tr>{["Severity", "Row", "Column", "Issue"].map((label) => <th key={label} scope="col" className="border-b border-line px-4 py-3 text-xs font-semibold text-ink-2">{label}</th>)}</tr></thead>
              <tbody>{issues.map((issue, index) => <tr key={`${issue.severity}-${index}`} className="border-b border-line last:border-0 align-top">
                <td className="px-4 py-3"><Badge tone={issue.severity === "Error" ? "critical" : "attention"}>{issue.severity}</Badge></td>
                <td className="px-4 py-3 tabular whitespace-nowrap">{issue.row ?? "File-level"}</td>
                <td className="px-4 py-3">{issue.column ?? "Not specified"}</td>
                <td className="min-w-52 px-4 py-3">{issue.message}{issue.value !== null && issue.value !== undefined && <p className="mt-1 text-xs text-ink-2">Source value: {issue.value === "" ? "blank" : issue.value}</p>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <div className="p-5"><EmptyState title="No validation issues returned">Continue to declare provenance and review the import.</EmptyState></div>}
        {children && <div className="border-t border-line p-4">{children}</div>}
        <p className="border-t border-line p-4 text-xs text-ink-2">Issue counts can exceed rejected rows. File-level issues and capped error lists do not provide a reliable rejected-row total. Warning counts describe the returned list.</p>
      </Panel>
      {summary && <Panel title="Validation scope and data semantics" motif="records">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            <p><span className="text-ink-2">Rows after duplicate policy:</span> {fmtNum(summary.rows_to_import)} of {fmtNum(summary.rows)}. {validation.can_accept ? "Ready for confirmation." : "These are not accepted records while errors remain."}</p>
            <p><span className="text-ink-2">Period coverage:</span> {summary.coverage_start ?? "Unavailable"} to {summary.coverage_end ?? "Unavailable"}</p>
            {summary.value_status && <p><span className="text-ink-2">Received values:</span> {fmtNum(summary.value_status.reported)} reported · {fmtNum(summary.value_status.zero)} explicit zero · {fmtNum(summary.value_status.blank)} blank</p>}
            <p><span className="text-ink-2">Timing:</span> {summary.has_timestamps ? "Due and received columns are mapped; delayed submissions can be distinguished where both values exist." : "Delay cannot be determined without due and received timestamps."}</p>
            <p className="border-l-2 border-brand-bright pl-3 text-xs leading-relaxed text-ink-2">A blank received value is not an explicit zero or a report that was never received. Imported files do not define expected submissions, so arrival rates cannot be calculated from this import.</p>
          </div>
          <div className="overflow-x-auto" role="region" aria-label="Field missingness" tabIndex={0}>
            <table className="w-full min-w-80 text-[13px]">
              <caption className="mb-3 text-left text-sm font-semibold">Missingness by mapped field</caption>
              <thead className="text-left text-xs text-ink-2"><tr><th scope="col" className="py-2 font-semibold">Field</th><th scope="col" className="py-2 text-right font-semibold">Blank</th><th scope="col" className="py-2 text-right font-semibold">Share</th></tr></thead>
              <tbody>{summary.missingness.map((field) => <tr key={field.field} className="border-t border-line"><td className="py-2">{field.label}<span className="block text-xs text-ink-2">{field.column}</span></td><td className="py-2 text-right tabular">{field.blank}</td><td className="py-2 text-right tabular">{fmtPct(field.share, 1)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </Panel>}
    </section>
  );
}
