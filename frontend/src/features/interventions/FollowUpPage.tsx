import * as D from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AssignmentStatusBadge, OutcomeBadge, OverdueBadge, SeverityBadge } from "@/components/data-display/badges";
import { ChipFilter } from "@/components/data-display/FilterBar";
import { PageHeader } from "@/components/data-display/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { KeyValue, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, InlineError, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/useToast";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { OUTCOME_SOURCE, OUTCOME_STATUS, ROLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { Assignment, AssignmentStatus, OutcomeStatus } from "@/types/api";

const STAGES = [
  { key: "proposed", label: "Planned" },
  { key: "approved", label: "Approved" },
  { key: "completed", label: "Done" },
  { key: "outcome", label: "Outcome" },
] as const;

export function StageTracker({ a }: { a: Assignment }) {
  const done = { proposed: true, approved: a.status !== "cancelled", completed: !!a.completed_at, outcome: a.stage === "outcome_verified" || a.stage === "outcome_observed" };
  const outcomeLabel = a.stage === "outcome_verified" ? "Verified" : a.stage === "outcome_observed" ? "Observed, unverified" : a.completed_at ? "Not yet verified" : "—";
  return (
    <ol className="grid grid-cols-4 gap-x-2" aria-label="Progress">
      {STAGES.map((s) => (
        <li key={s.key} className="min-w-0">
          <div className={cn("h-1.5 rounded-sm", done[s.key] ? "bg-teal-600" : "bg-line")} aria-hidden />
          <p className={cn("mt-1 flex min-w-0 items-start gap-1 text-[11.5px] leading-tight", done[s.key] ? "font-medium text-ink" : "text-ink-2")}>
            {done[s.key] && <Check className="mt-px size-3 shrink-0" aria-hidden />}<span className="min-w-0">{s.label}</span><span className="sr-only">{done[s.key] ? " (done)" : " (not yet)"}</span>
          </p>
          {s.key === "outcome" && <p className="text-[11px] text-ink-2">{outcomeLabel}</p>}
        </li>
      ))}
    </ol>
  );
}

const TRANSITION_LABEL: Record<AssignmentStatus, string> = { approved: "Mark approved", in_progress: "Start", completed: "Mark as done", closed: "Close", cancelled: "Cancel action" };

function AssignmentSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can, role } = useSession();
  const q = useQuery({ queryKey: ["assignment", id], queryFn: () => api.assignment(id!), enabled: !!id });
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [outcome, setOutcome] = useState<{ status: OutcomeStatus | ""; summary: string }>({ status: "", summary: "" });
  const upd = useMutation({
    mutationFn: (body: { status?: string; note?: string; evidence?: string; follow_up_date?: string }) => api.patchAssignment(id!, body),
    onSuccess: (a) => { qc.setQueryData(["assignment", id], a); qc.invalidateQueries({ predicate: (x) => x.queryKey[0] !== "assignment" }); setNote(""); setEvidence(""); setFollowUp(""); toast(`${a.id} updated.`); },
  });
  const out = useMutation({
    mutationFn: () => api.addOutcome(id!, { outcome_status: outcome.status, summary: outcome.summary }),
    onSuccess: (a) => { qc.setQueryData(["assignment", id], a); qc.invalidateQueries({ predicate: (x) => x.queryKey[0] !== "assignment" }); setOutcome({ status: "", summary: "" }); toast("Outcome recorded."); },
  });
  const a = q.data;
  return (
    <D.Root open={!!id} onOpenChange={(o) => { if (!o) { upd.reset(); out.reset(); onClose(); } }}>
      {id && (
        <SheetContent title={a ? `${a.id} · ${a.title}` : id} description="Follow-up action">
          <div className="flex flex-col gap-5 p-5">
            {q.error ? <ErrorState error={q.error} /> : !a ? <Loading /> : (
              <>
                <div className="flex flex-wrap gap-1.5"><AssignmentStatusBadge status={a.status} />{a.overdue && <OverdueBadge />}{a.severity && <SeverityBadge severity={a.severity} />}</div>
                <StageTracker a={a} />
                <KeyValue items={[
                  { label: "Action type", value: a.action_type_label ?? "—" },
                  { label: "Concern", value: a.concern_id ? <Link to={`/investigations/${a.concern_id}`} className="text-teal-900 hover:underline">{a.concern_id}</Link> : "—" },
                  { label: "Target units", value: a.target_units.join(", ") },
                  { label: "Responsible role", value: ROLE_LABELS[a.responsible_role] },
                  { label: "Assignee", value: a.assignee ?? "Unassigned" },
                  { label: "Plan", value: <Link to={`/investigations/plan?plan=${a.plan_id}`} className="text-teal-900 hover:underline">{a.plan_id}{a.plan_name ? ` · ${a.plan_name}` : ""}</Link> },
                  { label: "Action due", value: fmtDate(a.due_date) },
                  { label: "Check again on", value: fmtDate(a.follow_up_date) },
                  { label: "Done on", value: fmtDateTime(a.completed_at) },
                  { label: "What was done", value: a.evidence_of_completion ?? "Not recorded yet" },
                ]} />

                {can("assignment.update") && a.allowed_transitions.length > 0 && (
                  <div className="flex flex-col gap-3 border-t border-line pt-4">
                    <h3 className="text-sm font-semibold">Update</h3>
                    {a.allowed_transitions.includes("completed") && (
                      <Field label="What was done?" hint="Needed before marking it done.">{(p) => <Textarea {...p} rows={2} value={evidence} onChange={(e) => setEvidence(e.target.value)} />}</Field>
                    )}
                    <Field label="Note" optional hint="Needed if you cancel.">{(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
                    <div className="sm:w-48"><Field label="Check again on" optional>{(p) => <Input {...p} type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />}</Field></div>
                    <InlineError error={upd.error} />
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {a.allowed_transitions.map((t) => (
                        <Button key={t} variant={t === "cancelled" ? "danger" : t === "completed" || t === "in_progress" ? "primary" : "secondary"} disabled={upd.isPending}
                          onClick={() => upd.mutate({ status: t, note: note || undefined, evidence: evidence || undefined, follow_up_date: followUp || undefined })}>{t === "in_progress" && a.status === "completed" ? "Reopen" : TRANSITION_LABEL[t]}</Button>
                      ))}
                      {(note || followUp) && <Button variant="secondary" disabled={upd.isPending} onClick={() => upd.mutate({ note: note || undefined, follow_up_date: followUp || undefined })}>Save note</Button>}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 border-t border-line pt-4">
                  <h3 className="text-sm font-semibold">Result</h3>
                  {a.outcomes.length === 0 ? <p className="text-sm text-ink-2">No result recorded yet. {a.completed_at ? "Add one before closing." : "You can add one once the action is done."}</p> : (
                    <ul className="flex flex-col gap-3">
                      {a.outcomes.map((o) => (
                        <li key={o.id} className="text-sm">
                          <div className="flex flex-wrap gap-1.5"><OutcomeBadge status={o.outcome_status} /><Badge>{OUTCOME_SOURCE[o.source]}</Badge></div>
                          <p className="mt-1 text-ink">{o.summary}</p>
                          <p className="text-xs text-ink-2">{o.recorded_by} · {fmtDateTime(o.recorded_at)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {can("assignment.update") && (a.status === "completed" || a.status === "closed") && (
                    <form className="flex flex-col gap-3 rounded-md border border-line p-3" onSubmit={(e) => { e.preventDefault(); out.mutate(); }}>
                      <Field label="Result">
                        {(p) => (
                          <Select {...p} value={outcome.status} onChange={(e) => setOutcome({ ...outcome, status: e.target.value as OutcomeStatus })}>
                            <option value="">Choose…</option>
                            {(Object.keys(OUTCOME_STATUS) as OutcomeStatus[]).filter((k) => k !== "verified" || role !== "rhu_staff").map((k) => <option key={k} value={k}>{OUTCOME_STATUS[k].label}</option>)}
                          </Select>
                        )}
                      </Field>
                      <Field label="What did you see afterwards?" hint="Reporting can improve for other reasons too.">{(p) => <Textarea {...p} rows={2} value={outcome.summary} onChange={(e) => setOutcome({ ...outcome, summary: e.target.value })} />}</Field>
                      <InlineError error={out.error} />
                      <div><Button type="submit" size="sm" disabled={!outcome.status || outcome.summary.trim().length < 10 || out.isPending}>Save result</Button></div>
                    </form>
                  )}
                </div>

                <div className="flex flex-col gap-2 border-t border-line pt-4">
                  <h3 className="text-sm font-semibold">Notes</h3>
                  {a.follow_up_notes.length === 0 ? <p className="text-sm text-ink-2">No notes.</p> : (
                    <ul className="flex flex-col gap-2">{[...a.follow_up_notes].reverse().map((n, i) => <li key={i} className="border-l-2 border-line-strong pl-3 text-sm"><p>{n.text}</p><p className="text-xs text-ink-2">{n.by_name} · {fmtDateTime(n.at)}</p></li>)}</ul>
                  )}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      )}
    </D.Root>
  );
}

export function FollowUpPage() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState("active");
  const q = useQuery({ queryKey: ["assignments", status], queryFn: () => api.assignments({ status: status === "all" ? "" : status }) });
  const open = (id: string | null) => setParams((x) => { const n = new URLSearchParams(x); if (id) n.set("assignment", id); else n.delete("assignment"); return n; });
  const rows = q.data ?? [];
  return (
    <>
      <PageHeader title="Track actions" description="Approved actions and what happened after them. Open one to update it." />
      <Panel bodyClassName="p-0" className="max-w-5xl">
        <div className="border-b border-line px-4 py-3">
          <ChipFilter label="Show" value={status} onChange={setStatus} options={[
            { value: "active", label: "To do" }, { value: "completed", label: "Done, needs outcome" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" },
          ]} />
        </div>
        {q.error ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : !q.data ? <div className="p-4"><Loading /></div>
          : rows.length === 0 ? <div className="p-4"><EmptyState title="Nothing here">Approved plans create actions that appear in this list.</EmptyState></div> : (
          <ul className="divide-y divide-line" aria-label="Actions">
            {rows.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => open(a.id)} className="group flex w-full flex-col gap-3 px-4 py-3 text-left hover:bg-aqua-50/60 md:flex-row md:items-center">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-ink group-hover:text-teal-900">{a.title}</span>
                    <span className="mt-0.5 block text-[13px] text-ink-2">
                      {a.target_units.slice(0, 2).join(", ")}{a.target_units.length > 2 ? ` +${a.target_units.length - 2}` : ""} · {a.assignee ?? ROLE_LABELS[a.responsible_role]} · due {fmtDate(a.due_date)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-1.5"><AssignmentStatusBadge status={a.status} />{a.overdue && <OverdueBadge />}</span>
                  <span className="w-full md:w-80"><StageTracker a={a} /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <AssignmentSheet id={params.get("assignment")} onClose={() => open(null)} />
    </>
  );
}
