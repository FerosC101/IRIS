import * as D from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AssignmentStatusBadge, PlanStatusBadge } from "@/components/data-display/badges";
import { SimpleTable } from "@/components/data-display/charts";
import { Button } from "@/components/ui/button";
import { SheetContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { KeyValue } from "@/components/ui/panel";
import { ErrorState, InlineError, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/useToast";
import { fmtDate, fmtDateTime, fmtNum, fmtPct } from "@/lib/format";
import { api } from "@/services/api";

export const METHOD_LABEL = { optimized: "Optimized (budget-constrained)", baseline: "Baseline (highest priority first)", manual: "Manual selection" } as const;

export function PlanSheet({ planId, onClose }: { planId: string | null; onClose: () => void }) {
  const { can, unitName } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setNote(""); setErr(null); }, [planId]);
  const q = useQuery({ queryKey: ["plan", planId], queryFn: () => api.plan(planId!), enabled: !!planId });
  const m = useMutation({
    mutationFn: (decision: "approve" | "reject") => api.decidePlan(planId!, decision, note),
    onSuccess: (p) => { qc.invalidateQueries(); setNote(""); toast(p.status === "approved" ? `${p.id} approved. ${p.assignments?.length ?? 0} follow-up action(s) created.` : `${p.id} rejected.`); },
  });
  const decide = (d: "approve" | "reject") => {
    if (d === "reject" && note.trim().length < 10) { setErr("Give a reason for rejecting (at least 10 characters)."); return; }
    setErr(null);
    m.mutate(d);
  };
  return (
    <D.Root open={!!planId} onOpenChange={(o) => { if (!o && !m.isPending) { m.reset(); setErr(null); onClose(); } }}>
      {planId && (
        <SheetContent title={q.data ? `${q.data.id} · ${q.data.name}` : planId} description="Intervention plan">
          <div className="flex flex-col gap-5 p-5">
            {q.error ? <ErrorState error={q.error} /> : !q.data ? <Loading /> : (
              <>
                <div className="flex flex-wrap gap-2"><PlanStatusBadge status={q.data.status} /></div>
                <KeyValue items={[
                  { label: "Method", value: METHOD_LABEL[q.data.method] },
                  { label: "Budget", value: `${String(q.data.budget_hours)} staff-hours` },
                  { label: "Total cost", value: `${fmtNum(q.data.total_cost_hours, 1)} h` },
                  { label: "Assumed benefit", value: `${fmtNum(q.data.total_expected_benefit, 1)} report-weeks` },
                  { label: "Created", value: `${fmtDateTime(q.data.created_at)} by ${q.data.created_by}` },
                  { label: "Decision", value: q.data.decided_at ? `${q.data.status} ${fmtDateTime(q.data.decided_at)} by ${q.data.decided_by}` : "Pending" },
                  ...(q.data.decision_note ? [{ label: "Decision note", value: q.data.decision_note }] : []),
                  ...(q.data.notes ? [{ label: "Notes", value: q.data.notes }] : []),
                ]} />
                <div>
                  <h3 className="mb-1.5 text-sm font-semibold">Actions</h3>
                  <ul className="flex flex-col gap-3">
                    {q.data.actions?.map((a) => (
                      <li key={a.id} className="rounded-md border border-line p-3 text-sm">
                        <p className="font-medium">{a.title}</p>
                        <p className="text-xs text-ink-2">{a.action_type_label} · <Link className="text-teal-900 hover:underline" to={`/investigations/${a.concern_id}`}>{a.concern_id}</Link> · {a.unit_ids.map(unitName).join(", ")}</p>
                        <p className="mt-1 text-xs text-ink-2">{fmtNum(a.cost_hours, 1)} h · assumed success {fmtPct(a.success_probability)} · {fmtNum(a.expected_benefit, 1)} report-weeks · {a.time_days} day(s)</p>
                      </li>
                    ))}
                  </ul>
                </div>
                {q.data.assumptions && (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium text-teal-900">Assumptions saved with this plan</summary>
                    <div className="mt-2 overflow-x-auto"><SimpleTable head={["Action type", "Base h", "h / unit", "Success", "Days"]}
                      rows={Object.entries(q.data.assumptions.action_types).map(([k, v]) => [k.replace(/_/g, " "), v.base_hours, v.hours_per_unit, fmtPct(v.success_probability), v.time_days])} /></div>
                    <p className="mt-1 text-xs text-ink-2">Planning horizon {q.data.assumptions.horizon_weeks} weeks. These are simulation assumptions, not evidence of effectiveness.</p>
                  </details>
                )}
                {q.data.assignments && q.data.assignments.length > 0 && (
                  <div>
                    <h3 className="mb-1.5 text-sm font-semibold">Follow-up actions</h3>
                    <ul className="flex flex-col gap-2 text-sm">
                      {q.data.assignments.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-2"><Link to={`/investigations/follow-up?assignment=${a.id}`} className="font-medium text-teal-900 hover:underline">{a.id}</Link><AssignmentStatusBadge status={a.status} /><span className="text-xs text-ink-2">due {fmtDate(a.due_date)}</span></li>)}
                    </ul>
                  </div>
                )}
                {q.data.status === "draft" && (can("plan.decide") ? (
                  <div className="flex flex-col gap-3 border-t border-line pt-4">
                    <h3 className="text-sm font-semibold">Record a decision</h3>
                    <Field label="Decision note" hint="Required when rejecting." error={err ?? undefined}>{(p) => <Textarea {...p} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
                    <InlineError error={m.error} />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button onClick={() => decide("approve")} disabled={m.isPending}>Approve plan</Button>
                      <Button variant="danger" onClick={() => decide("reject")} disabled={m.isPending}>Reject plan</Button>
                    </div>
                    <p className="text-xs text-ink-2">Approval creates follow-up actions. No facility is contacted; this is a simulation.</p>
                  </div>
                ) : <p className="text-sm text-ink-2">Your demo role cannot approve or reject plans.</p>)}
              </>
            )}
          </div>
        </SheetContent>
      )}
    </D.Root>
  );
}
