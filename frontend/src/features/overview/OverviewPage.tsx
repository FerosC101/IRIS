import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, FileWarning, MessageSquareReply } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { TrendChart } from "@/components/data-display/charts";
import { ChipFilter } from "@/components/data-display/FilterBar";
import { ChoiceFilter, type GlobalFilterKey } from "@/components/shell/GlobalFilterBar";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { fmtDate, fmtNum, fmtPct, fmtPeriod } from "@/lib/format";
import { canAccess } from "@/lib/navigation";
import { api } from "@/services/api";
import type { Task } from "@/types/api";
import { GettingStarted } from "./GettingStarted";
import { PriorityLabel, QueueStatus, QueueTable } from "./QueueTable";
import { SubmitReportDialog } from "./SubmitReportDialog";

function TaskList({ tasks }: { tasks: Task[] }) {
  const [active, setActive] = useState<Task | null>(null);
  if (!tasks.length) return <EmptyState title="You're all caught up">Every expected report from the last four weeks has arrived.</EmptyState>;
  return (
    <>
      <ul className="divide-y divide-line">
        {tasks.map((t) => (
          <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2.5">
              {t.kind === "clarification" ? <MessageSquareReply className="mt-0.5 size-4 shrink-0 text-attention-ink" aria-hidden /> : <FileWarning className="mt-0.5 size-4 shrink-0 text-critical-ink" aria-hidden />}
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{t.kind === "clarification" ? "Your coordinator has a question" : `${t.category} report missing`}</p>
                <p className="text-[13px] text-ink-2">
                  {t.kind === "missing_report" ? <>For {fmtPeriod(t.period_start!, t.period_end)} · was due {fmtDate(t.due_at)}</> : <>{t.message}{t.due_at && <> · reply by {fmtDate(t.due_at)}</>}</>}
                </p>
              </div>
            </div>
            {t.kind === "missing_report" ? (
              <Button size="sm" className="w-full sm:w-auto" onClick={() => setActive(t)}>Submit report</Button>
            ) : (
              <Link to={`/investigations/${t.concern_id}#respond`} className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-teal-900 px-3 text-[13px] font-medium text-white hover:bg-teal-800 sm:min-h-8 sm:w-auto">
                Reply
              </Link>
            )}
          </li>
        ))}
      </ul>
      <SubmitReportDialog task={active} open={!!active} onOpenChange={(o) => !o && setActive(null)} />
    </>
  );
}

const PERIODS = [
  { value: "latest", label: "Latest week" }, { value: "4w", label: "Last 4 weeks" },
  { value: "13w", label: "Last 13 weeks" }, { value: "all", label: "All weeks" },
];
// Open concerns move through these stages; the bar shows how many sit at each.
const STAGES = [
  { key: "new", label: "New", color: "#0E6680" },
  { key: "under_review", label: "Being reviewed", color: "#1A9EA0" },
  { key: "clarification_requested", label: "Waiting for reply", color: "#C98A1A" },
  { key: "in_investigation", label: "Being fixed", color: "#7893A8" },
] as const;

/** One headline number: label, value, and a short line of context. */
function Stat({ label, value, note, tone, children, className }: { label: string; value: string; note?: ReactNode; tone?: "critical"; children?: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col rounded-lg border border-line bg-white px-4 py-3.5 sm:px-5 sm:py-4 ${className ?? ""}`}>
      <dt className="text-[13px] font-medium text-ink-2">{label}</dt>
      <dd className={`mt-1 text-[26px] leading-none sm:text-[32px] font-semibold tracking-tight tabular ${tone === "critical" ? "text-critical-ink" : "text-ink"}`}>{value}</dd>
      {note && <dd className="mt-2 text-xs leading-snug text-ink-2">{note}</dd>}
      {children}
    </div>
  );
}

function Change({ now, before }: { now: number | null | undefined; before: number | null | undefined }) {
  if (now == null || before == null) return null;
  const d = Math.round((now - before) * 100);
  if (d === 0) return <span className="font-medium text-ink">no change</span>;
  return <span className={`font-medium ${d < 0 ? "text-critical-ink" : "text-positive-ink"}`}>{d > 0 ? "▲" : "▼"} {Math.abs(d)} pts</span>;
}

export function OverviewPage() {
  const { meta, role, unitName } = useSession();
  const [period, setPeriod] = useState("4w");
  const [status, setStatus] = useState("active");
  const q = useQuery({ queryKey: ["overview", period, status], queryFn: () => api.overview({ period, status }) });
  const all = useQuery({ queryKey: ["overview", period, "active"], queryFn: () => api.overview({ period, status: "active" }), enabled: status !== "active" });
  const active = status === "active" ? q.data : all.data;
  const counts = active?.counts;
  const trend = q.data?.trend ?? [];
  const latest = trend.at(-1);
  const before = trend.at(-2);
  const openConcerns = counts ? counts.new + counts.under_review + counts.clarification_requested + counts.in_investigation : undefined;
  const total = counts && openConcerns !== undefined ? openConcerns + counts.follow_ups_active : undefined;
  const priority = active?.queue.find((row) => row.kind === "concern" && row.severity === "high") ?? active?.queue.find((row) => row.kind === "concern");
  const scope = q.data?.scope;
  const scopeLabel = scope?.unit_id ? unitName(scope.unit_id) : scope?.province ?? "All reporting units";
  const rhu = role === "rhu_staff";

  // Only the period applies here; the shared region, disease, week and unit filters do not change this page.
  const filterBar = {
    hide: ["region", "disease", "weeks", "group"] as GlobalFilterKey[],
    extra: <ChoiceFilter label="Queue period" icon={<CalendarDays aria-hidden />} value={period} defaultValue="4w" onChange={setPeriod} options={PERIODS} />,
    extraChanged: period !== "4w" ? 1 : 0,
    onResetExtra: () => setPeriod("4w"),
  };

  return (
    <>
      <ScreenHeader screen="dashboard" filterBar={filterBar} />
      <div className="iris-workspace-stack mt-[25px]">
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data ? <Loading label="Loading overview" /> : (
          <>
            {/* 1. The story in one paragraph. */}
            <section aria-labelledby="summary-title" className="flex flex-col gap-2">
              <p className="iris-eyebrow">This week · {latest ? `week of ${fmtDate(latest.period_start)}` : "latest week"}</p>
              <h2 id="summary-title" className="max-w-4xl text-[22px] leading-snug font-semibold text-ink">
                {latest?.completeness != null ? <>{fmtPct(latest.completeness)} of expected reports arrived. </> : <>Reporting completeness is not available for this scope. </>}
                {rhu && counts?.tasks ? <>You have {counts.tasks} report{counts.tasks === 1 ? "" : "s"} or repl{counts.tasks === 1 ? "y" : "ies"} to send. </> : null}
                {openConcerns ? <>{openConcerns} reporting concern{openConcerns === 1 ? " is" : "s are"} open{counts?.new ? <>, {counts.new} not yet looked at</> : null}.</> : <>No reporting concerns are open.</>}
                {counts?.overdue_follow_ups ? <> {counts.overdue_follow_ups} follow-up {counts.overdue_follow_ups === 1 ? "is" : "are"} overdue.</> : null}
              </h2>
              <p className="text-[13px] text-ink-2">
                {scopeLabel} · dataset {meta?.demo_dataset_id ?? "unavailable"}, snapshot {fmtDate(q.data.dataset_as_of)} · simulated data. Concerns are flags for review, not confirmed problems.
              </p>
            </section>

            {/* 2. Headline numbers. */}
            <dl className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Reporting indicators">
              <Stat label="Reports received" value={fmtPct(latest?.completeness)}
                note={latest?.completeness == null ? "Not available for this scope." : <><Change now={latest.completeness} before={before?.completeness} /> vs the week before. Late reports can still arrive.</>} />
              <Stat label="Received on time" value={fmtPct(latest?.timeliness)}
                note={latest?.timeliness == null ? "Not available for this scope." : <><Change now={latest.timeliness} before={before?.timeliness} /> vs the week before.</>} />
              <Stat label="Open concerns" value={fmtNum(openConcerns)} note="All weeks, in your reporting scope." className="col-span-2 sm:col-span-1">
                {!!openConcerns && counts && (
                  <div className="mt-3">
                    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                      {STAGES.map((st) => counts[st.key] > 0 && <span key={st.key} style={{ flexGrow: counts[st.key], background: st.color }} />)}
                    </div>
                    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11.5px] text-ink-2">
                      {STAGES.map((st) => (
                        <li key={st.key} className="flex items-center gap-1.5"><span className="size-2 shrink-0 rounded-sm" style={{ background: st.color }} aria-hidden />{st.label}<span className="ml-auto font-medium text-ink tabular">{counts[st.key]}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </Stat>
              {rhu
                ? <Stat label="Reports and replies due" value={fmtNum(counts?.tasks)} note="Outstanding tasks for your unit." tone={counts?.tasks ? "critical" : undefined} />
                : <Stat label="Overdue follow-ups" value={fmtNum(counts?.overdue_follow_ups)} tone={counts?.overdue_follow_ups ? "critical" : undefined}
                    note={<>{fmtNum(counts?.follow_ups_active)} corrective action{counts?.follow_ups_active === 1 ? "" : "s"} in progress.</>} />}
            </dl>
            {all.error && status !== "active" && <ErrorState error={all.error} onRetry={() => all.refetch()} title="Scope-wide indicators could not refresh" />}

            {rhu && <Panel id="tasks" title={`Your to-do list (${q.data.tasks.length})`} motif="records"><TaskList tasks={q.data.tasks} /></Panel>}

            {/* 3. Trend, and the one thing to look at first. */}
            <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
              <Panel title="Reporting over the last 12 weeks" description="Share of expected weekly reports that arrived, and that arrived by the due date." motif="trends">
                {trend.some((point) => point.completeness !== null || point.timeliness !== null) ? (
                  <TrendChart data={trend} xKey="period_start" series={[{ key: "completeness", label: "Received" }, { key: "timeliness", label: "On time" }]} title="Reporting completeness and timeliness" height={240} />
                ) : <EmptyState title="Reporting trend unavailable">This scope does not provide the reporting expectations needed for these metrics.</EmptyState>}
                {role && canAccess("/reports/recovery", role) && <Link to="/reports/recovery" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-teal-900 hover:underline">See recovery after actions <ArrowRight className="size-4" aria-hidden /></Link>}
              </Panel>
              <Panel title="Look at this first" description={priority?.severity === "high" ? "The highest-priority open concern in the queue period." : "An open concern from the queue period."} motif="verify" className="iris-priority">
                {priority ? (
                  <div className="flex h-full flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2"><PriorityLabel severity={priority.severity} /><span className="text-ink-2/50" aria-hidden>·</span><QueueStatus row={priority} /></div>
                    <div>
                      <p className="text-xs font-medium tracking-wide text-ink-2 uppercase">{priority.concern_type_label}</p>
                      <h3 className="mt-1 text-lg leading-snug font-semibold">{priority.title}</h3>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                      <div><dt className="text-xs text-ink-2">Weeks</dt><dd className="font-medium">{fmtPeriod(priority.period_start, priority.period_end)}</dd></div>
                      <div><dt className="text-xs text-ink-2">Units affected</dt><dd className="font-medium">{fmtNum(priority.units.length)}</dd></div>
                      <div><dt className="text-xs text-ink-2">Owner</dt><dd className="font-medium">{priority.assigned?.replace(" (demo)", "") ?? "Unassigned"}</dd></div>
                      <div><dt className="text-xs text-ink-2">Reference</dt><dd className="font-medium">{priority.id}</dd></div>
                    </dl>
                    {role && canAccess(priority.link, role) && <Link to={priority.link} className="iris-button iris-button-primary mt-auto inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 text-sm font-semibold">Review the evidence <ArrowRight className="size-4" aria-hidden /></Link>}
                    <p className="text-xs text-ink-2">Priority is advisory: a flag is a reason to check, not proof of a reporting failure.</p>
                  </div>
                ) : <EmptyState title="No open concern in this period">Choose a longer queue period in the filters to see others.</EmptyState>}
              </Panel>
            </div>

            {/* 4. Everything that needs attention. */}
            <Panel id="queue" title={rhu ? "Concerns about your unit" : "Work queue"} motif="records" bodyClassName="p-0"
              description={`Concerns and corrective actions from ${fmtPeriod(q.data.period.start, q.data.period.end)}, overdue first. Open a row to review it.`}>
              <div className="border-b border-line px-4 py-3">
                <ChipFilter label="Show" value={status} onChange={setStatus} options={[
                  { value: "active", label: "All open", count: total }, { value: "open", label: "New", count: counts?.new },
                  { value: "under_review", label: "Being reviewed", count: counts?.under_review }, { value: "clarification_requested", label: "Waiting for reply", count: counts?.clarification_requested },
                  { value: "in_investigation", label: "Being fixed", count: counts?.in_investigation }, { value: "all", label: "Include closed" },
                ]} />
              </div>
              <div className="px-4 py-2 md:p-0">
                <QueueTable rows={q.data.queue} emptyState={<div className="py-4"><EmptyState title={status === "active" ? "Nothing needs attention in this period" : "No matching items"}>{status === "active" ? "No open concerns or actions in this period." : <Button variant="secondary" size="sm" onClick={() => setStatus("active")}>Show all open items</Button>}</EmptyState></div>} />
              </div>
            </Panel>

            {/* 5. What was closed recently. */}
            <Panel title="Recently closed" variant="secondary" motif="verify">
              {q.data.recently_closed.length ? (
                <ul className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
                  {q.data.recently_closed.slice(0, 4).map((c) => (
                    <li key={c.id} className="min-w-0 text-sm">
                      <Link to={`/investigations/${c.id}`} className="font-medium text-teal-900 hover:underline">{c.title}</Link>
                      <p className="mt-0.5 text-xs text-ink-2">{c.status_label} · {fmtDate(c.closed_at)}</p>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="No recently closed concerns" />}
            </Panel>
          </>
        )}
        {role && <GettingStarted role={role} />}
      </div>
    </>
  );
}
