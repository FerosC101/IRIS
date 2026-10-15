import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CheckCircle2, ClipboardList, Eye, MessageSquare, RotateCcw, UserPlus, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ConcernStatusBadge, SeverityBadge, SimulatedTag } from "@/components/data-display/badges";
import { PageHeader } from "@/components/data-display/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { ActionMenu, type MenuItem } from "@/components/ui/menu";
import { KeyValue, Panel } from "@/components/ui/panel";
import { ErrorState, InlineError, Loading } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { usePreferences } from "@/hooks/usePreferences";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/useToast";
import { fmtDate, fmtDateTime, fmtPeriod } from "@/lib/format";
import { ASSIGNMENT_STATUS, UNIT_TYPE } from "@/lib/labels";
import { canAccess } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { ConcernDetail } from "@/types/api";
import { QueueTable } from "../overview/QueueTable";
import { AssignDialog, ReasonDialog } from "./ActionDialogs";
import { EvidenceList, ObservationTimeline, TechnicalDetails } from "./EvidenceSections";
import { WeekStrip } from "./WeekStrip";

type DialogKind = null | "confirm" | "dismiss" | "clarify" | "respond" | "resolve" | "reopen" | "assign";

const NOTE_LABEL: Record<string, string> = {
  note: "Note", clarification_request: "Question to the unit", clarification_response: "Reply from the unit",
  resolution: "Resolution", confirmation: "Confirmed", dismissal: "Closed as not a problem",
};

const STEPS = ["Review", "Verify", "Act", "Close"] as const;

function stepIndex(d: ConcernDetail): number {
  const c = d.concern;
  if (c.status === "resolved" || c.status === "dismissed") return 4;
  if (c.status === "open") return 0;
  if (c.status === "in_investigation" && c.verification === "confirmed") return 2;
  return 1;
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Progress">
      {STEPS.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={s} aria-current={now ? "step" : undefined}>
            <div className={cn("h-1.5 rounded-full", done ? "bg-teal-600" : now ? "bg-teal-900" : "bg-line")} aria-hidden />
            <p className={cn("mt-1.5 flex items-center gap-1 text-[13px]", now ? "font-semibold text-teal-900" : done ? "text-ink" : "text-ink-2")}>
              {done && <Check className="size-3.5 text-teal-600" aria-hidden />}{s}
              <span className="sr-only">{done ? " (done)" : now ? " (current step)" : ""}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-white p-4">
      <h2 className="mb-2 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function InvestigationPage() {
  const { id = "" } = useParams();
  const loc = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const { can, role } = useSession();
  const { prefs } = usePreferences();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [tab, setTab] = useState("summary");
  const [note, setNote] = useState("");
  const [showNumbers, setShowNumbers] = useState(false);
  const q = useQuery({ queryKey: ["concern", id], queryFn: () => api.concern(id) });

  const act = useMutation({
    mutationFn: ({ action, body }: { action: Parameters<typeof api.concernAction>[1]; body: object; msg: string }) => api.concernAction(id, action, body),
    onSuccess: (data, vars) => {
      qc.setQueryData(["concern", id], data);
      qc.invalidateQueries({ predicate: (qq) => qq.queryKey[0] !== "concern" });
      setDialog(null);
      toast(vars.msg);
    },
  });
  const noteM = useMutation({
    mutationFn: () => api.concernAction(id, "notes", { body: note }),
    onSuccess: (data) => { qc.setQueryData(["concern", id], data); setNote(""); toast("Note added."); },
  });

  useEffect(() => {
    if (loc.hash === "#respond" && q.data?.concern.status === "clarification_requested" && can("concern.respond")) setDialog("respond");
  }, [loc.hash, q.data?.concern.status, can]);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} title={`Concern ${id} could not be loaded`} />;
  if (!q.data) return <Loading label="Loading concern" />;
  const d = q.data;
  const c = d.concern;
  const closed = c.status === "resolved" || c.status === "dismissed";
  const open = (k: DialogKind) => { act.reset(); setDialog(k); };
  const review = () => act.mutate({ action: "review", body: {}, msg: "Marked as being reviewed." });

  // One main action for the current step; everything else goes in "More actions".
  type Primary = { label: string; icon: ReactNode; run?: () => void; to?: string } | null;
  let primary: Primary = null;
  let hint = d.next_step.text;
  const isRhu = role === "rhu_staff";
  if (closed) {
    hint = c.status === "resolved" ? "This concern is resolved. Nothing else to do." : "This was closed as not a problem. Nothing else to do.";
  } else if (c.status === "clarification_requested" && can("concern.respond") && (isRhu || !can("concern.confirm"))) {
    primary = { label: "Reply to the question", icon: <MessageSquare aria-hidden />, run: () => open("respond") };
    hint = "Your coordinator asked a question about this. Reply so they can close it.";
  } else if (c.status === "open" && can("concern.review")) {
    primary = { label: "Start review", icon: <Eye aria-hidden />, run: review };
    hint = "Look at the evidence below, then start the review.";
  } else if (c.verification !== "confirmed" && can("concern.confirm")) {
    primary = { label: "Confirm it's a real problem", icon: <CheckCircle2 aria-hidden />, run: () => open("confirm") };
    if (c.status === "clarification_requested") hint = "Waiting for the unit to reply. Confirm or close it once you know more.";
  } else if (d.next_step.action === "plan" && role && canAccess("/planner", role)) {
    primary = { label: "Plan an action", icon: <ArrowRight aria-hidden />, to: `/planner?concern=${c.id}` };
  } else if (d.next_step.action === "follow_up") {
    const a = d.assignments.find((x) => x.status === "approved" || x.status === "in_progress");
    primary = { label: "Track the action", icon: <ArrowRight aria-hidden />, to: `/follow-up${a ? `?assignment=${a.id}` : ""}` };
  } else if (can("concern.resolve")) {
    primary = { label: "Mark as resolved", icon: <ClipboardList aria-hidden />, run: () => open("resolve") };
  }

  const more: MenuItem[] = [];
  if (!closed) {
    if (c.status === "open" && can("concern.review") && primary?.label !== "Start review") more.push({ label: "Start review", icon: <Eye aria-hidden />, onSelect: review });
    if (c.verification !== "confirmed" && can("concern.confirm") && !primary?.label.startsWith("Confirm")) more.push({ label: "Confirm it's a real problem", icon: <CheckCircle2 aria-hidden />, onSelect: () => open("confirm") });
    if (can("concern.clarify") && c.status !== "clarification_requested") more.push({ label: "Ask the unit a question", icon: <MessageSquare aria-hidden />, onSelect: () => open("clarify") });
    if (c.status === "clarification_requested" && can("concern.respond") && primary?.label !== "Reply to the question") more.push({ label: "Add the unit's reply", icon: <MessageSquare aria-hidden />, onSelect: () => open("respond") });
    if (can("concern.assign")) more.push({ label: d.investigation ? "Change owner" : "Assign an owner", icon: <UserPlus aria-hidden />, onSelect: () => open("assign") });
    if (can("concern.resolve") && primary?.label !== "Mark as resolved") more.push({ label: "Mark as resolved", icon: <ClipboardList aria-hidden />, onSelect: () => open("resolve") });
    if (can("concern.dismiss")) more.push({ label: "Close as not a problem", icon: <XCircle aria-hidden />, danger: true, onSelect: () => open("dismiss") });
  } else if (can("concern.reopen")) {
    more.push({ label: "Reopen", icon: <RotateCcw aria-hidden />, onSelect: () => open("reopen") });
  }

  const observed = d.evidence.filter((e) => (e.kind === "observed" || e.kind === "confirmed_by_reviewer") && e.detail !== c.summary);
  const unknown = d.evidence.filter((e) => e.kind === "possible_explanation" || e.kind === "requires_verification");
  const answerKey = d.evidence.filter((e) => e.kind === "simulated_example" && e.title.startsWith("Simulation answer key"));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Concerns", to: "/investigations" }, { label: c.id }]}
        title={c.title}
        meta={<>
          <ConcernStatusBadge status={c.status} />
          <SeverityBadge severity={c.severity} />
          <span className="text-[13px] text-ink-2">{fmtPeriod(c.period_start, c.period_end)}</span>
          {c.simulated && <SimulatedTag />}
        </>}
      />

      <div className="flex max-w-5xl flex-col gap-5">
        <section aria-label="Next step" className="rounded-md border border-teal-900/20 bg-white p-4">
          <Stepper current={stepIndex(d)} />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px] text-ink"><span className="font-semibold text-teal-900">Next: </span>{hint}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
              {primary && (primary.to
                ? <Link to={primary.to} className={buttonVariants()}>{primary.icon}{primary.label}</Link>
                : <Button onClick={primary.run} disabled={act.isPending}>{primary.icon}{primary.label}</Button>)}
              <ActionMenu items={more} />
            </div>
          </div>
          {(d.investigation || c.follow_up_due) && (
            <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink-2">
              {d.investigation && <>Owner: <span className="text-ink">{d.investigation.owner}</span></>}
              {d.investigation && c.follow_up_due && " · "}
              {c.follow_up_due && <>Due {fmtDate(c.follow_up_due)}</>}
            </p>
          )}
        </section>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList label="Concern sections" tabs={[
            { value: "summary", label: "Summary" },
            { value: "weeks", label: "Week by week" },
            { value: "notes", label: `Notes & history${d.notes.length ? ` (${d.notes.length})` : ""}` },
            { value: "details", label: "More details" },
          ]} />

          <TabsContent value="summary" className="flex flex-col gap-4">
            <Block title="What happened"><p className="text-sm text-ink">{c.summary}</p></Block>
            <Block title="What the data shows">
              <EvidenceList items={observed} />
            </Block>
            {unknown.length > 0 && (
              <Block title="Not yet known">
                <p className="mb-3 text-[13px] text-ink-2">These are possibilities, not facts. A person needs to check them.</p>
                <EvidenceList items={unknown} />
              </Block>
            )}
            <Block title={c.units.length > 1 ? `Units involved (${c.units.length})` : "Unit involved"}>
              {d.via_label && <p className="mb-2 text-[13px] text-ink-2">Connected through {d.via_label}.</p>}
              <ul className="flex flex-wrap gap-2">
                {c.units.map((u) => (
                  <li key={u.id}>
                    {role && canAccess("/network", role)
                      ? <Link to={`/network?unit=${u.id}`} className="inline-flex min-h-9 items-center rounded-md border border-line px-2.5 text-sm text-teal-900 hover:bg-aqua-50">{u.name}</Link>
                      : <span className="inline-flex min-h-9 items-center rounded-md border border-line px-2.5 text-sm">{u.name}</span>}
                  </li>
                ))}
              </ul>
            </Block>
          </TabsContent>

          <TabsContent value="weeks" className="flex flex-col gap-4">
            <Block title="Reports each week">
              <WeekStrip detail={d} />
              <button type="button" className="mt-3 min-h-11 text-[13px] font-medium text-teal-900 hover:underline sm:min-h-0" aria-expanded={showNumbers} onClick={() => setShowNumbers((s) => !s)}>
                {showNumbers ? "Hide the numbers" : "Show the numbers"}
              </button>
              {showNumbers && <div className="mt-3"><ObservationTimeline detail={d} /></div>}
            </Block>
          </TabsContent>

          <TabsContent value="notes" className="flex flex-col gap-4">
            {can("concern.note") && (
              <Block title="Add a note">
                <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) noteM.mutate(); }}>
                  <label htmlFor="new-note" className="sr-only">Add a note</label>
                  <Textarea id="new-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you check or learn?" />
                  <InlineError error={noteM.error} />
                  <div><Button type="submit" size="sm" disabled={!note.trim() || noteM.isPending}>{noteM.isPending ? "Saving…" : "Add note"}</Button></div>
                </form>
              </Block>
            )}
            <Block title="Notes">
              {d.notes.length === 0 ? <p className="text-sm text-ink-2">No notes yet.</p> : (
                <ul className="flex flex-col gap-3">
                  {d.notes.map((n) => (
                    <li key={n.id} className="border-l-2 border-line-strong pl-3">
                      <p className="text-xs text-ink-2"><span className="font-medium text-ink">{NOTE_LABEL[n.note_type] ?? n.note_type}</span> · {n.author} · {fmtDateTime(n.created_at)}</p>
                      <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink">{n.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Block>
            <Block title="History">
              <ol className="flex flex-col gap-2.5">
                {d.activity.map((e) => (
                  <li key={e.id} className="text-sm"><p className="text-ink">{e.summary}</p><p className="text-xs text-ink-2">{fmtDateTime(e.at)}</p></li>
                ))}
              </ol>
            </Block>
          </TabsContent>

          <TabsContent value="details" className="flex flex-col gap-4">
            <Block title="About this concern">
              <KeyValue items={[
                { label: "ID", value: <span className="font-mono text-xs">{c.id}</span> },
                { label: "Type", value: c.concern_type_label },
                { label: "Found by", value: `${c.detection_method_label} check · ${fmtDate(c.created_at)}` },
                { label: "Owner", value: d.investigation ? `${d.investigation.owner} (since ${fmtDate(d.investigation.opened_at)})` : "Not assigned" },
                ...(c.confirmation_reason ? [{ label: "Why it was confirmed", value: c.confirmation_reason }] : []),
                ...(c.dismissal_reason ? [{ label: "Why it was closed", value: c.dismissal_reason }] : []),
                ...(c.resolution_summary ? [{ label: "How it was resolved", value: c.resolution_summary }] : []),
              ]} />
            </Block>
            {d.assignments.length > 0 && (
              <Block title="Actions taken">
                <ul className="flex flex-col gap-2 text-sm">
                  {d.assignments.map((a) => (
                    <li key={a.id}><Link to={`/follow-up?assignment=${a.id}`} className="font-medium text-teal-900 hover:underline">{a.title}</Link>
                      <p className="text-xs text-ink-2">{ASSIGNMENT_STATUS[a.status].label} · due {fmtDate(a.due_date)}</p></li>
                  ))}
                </ul>
              </Block>
            )}
            <Block title="How it was detected"><TechnicalDetails detail={d} /></Block>
            {prefs.showAnswerKey && answerKey.length > 0 && (
              <Block title="Simulation answer key (demo only)">
                <p className="mb-3 text-[13px] text-ink-2">Shows what was really injected into the simulated data. Hide it in Settings.</p>
                <EvidenceList items={answerKey} />
              </Block>
            )}
            <Panel title={`Related concerns (${d.related.length})`} bodyClassName="p-0">
              {d.related.length === 0 ? <p className="p-4 text-sm text-ink-2">None involve these units or the same hub in nearby weeks.</p> : <QueueTable rows={d.related} caption="Related concerns" />}
            </Panel>
            <p className="text-xs text-ink-2">{c.units.map((u) => `${u.name} (${UNIT_TYPE[u.unit_type]}, ${u.province})`).join(" · ")}</p>
          </TabsContent>
        </Tabs>
      </div>

      <ReasonDialog open={dialog === "confirm"} onOpenChange={(o) => !o && setDialog(null)} title="Confirm it's a real problem" label="How did you confirm it?"
        hint="For example: who you spoke to and what they said." submitLabel="Confirm" pending={act.isPending} error={act.error}
        onSubmit={(t) => act.mutate({ action: "confirm", body: { reason: t }, msg: "Confirmed as a real problem." })} />
      <ReasonDialog open={dialog === "dismiss"} onOpenChange={(o) => !o && setDialog(null)} title="Close as not a problem" danger
        description="You can reopen it later if needed." label="Why is this not a problem?" submitLabel="Close concern"
        pending={act.isPending} error={act.error} onSubmit={(t) => act.mutate({ action: "dismiss", body: { reason: t }, msg: "Closed as not a problem." })} />
      <ReasonDialog open={dialog === "clarify"} onOpenChange={(o) => !o && setDialog(null)} title="Ask the unit a question" withDue
        description="The unit will see this in its to-do list." label="Your question" submitLabel="Send question" pending={act.isPending} error={act.error}
        onSubmit={(t, due) => act.mutate({ action: "clarify", body: { message: t, due: due || null }, msg: "Question sent to the unit." })} />
      <ReasonDialog open={dialog === "respond"} onOpenChange={(o) => !o && setDialog(null)} title="Reply to the question"
        description={d.notes.find((n) => n.note_type === "clarification_request")?.body} label="Your reply" submitLabel="Send reply" pending={act.isPending} error={act.error}
        onSubmit={(t) => act.mutate({ action: "respond", body: { message: t }, msg: "Reply sent." })} />
      <ReasonDialog open={dialog === "resolve"} onOpenChange={(o) => !o && setDialog(null)} title="Mark as resolved" label="What was done?"
        hint="Briefly say what fixed it and what you saw afterwards." submitLabel="Mark resolved" pending={act.isPending} error={act.error}
        onSubmit={(t) => act.mutate({ action: "resolve", body: { summary: t }, msg: "Marked as resolved." })} />
      <ReasonDialog open={dialog === "reopen"} onOpenChange={(o) => !o && setDialog(null)} title="Reopen concern" label="Why reopen it?" submitLabel="Reopen"
        pending={act.isPending} error={act.error} onSubmit={(t) => act.mutate({ action: "reopen", body: { reason: t }, msg: "Concern reopened." })} />
      <AssignDialog open={dialog === "assign"} onOpenChange={(o) => !o && setDialog(null)} users={d.assignable_users} current={d.investigation?.owner_user_id}
        pending={act.isPending} error={act.error} onSubmit={(v) => act.mutate({ action: "assign", body: v, msg: "Owner assigned." })} />
    </>
  );
}
