import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileWarning, MessageSquareReply } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { TrendChart } from "@/components/data-display/charts";
import { MetricCard } from "@/components/data-display/MetricCard";
import { ChipFilter } from "@/components/data-display/FilterBar";
import { PageHeader } from "@/components/data-display/PageHeader";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { KeyValue, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { fmtDate, fmtNum, fmtPct, fmtPeriod } from "@/lib/format";
import { canAccess } from "@/lib/navigation";
import { api } from "@/services/api";
import type { Task } from "@/types/api";
import { GettingStarted } from "./GettingStarted";
import { QueueStatus, QueueTable } from "./QueueTable";
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

export function OverviewPage() {
  const { meta, role, unitName } = useSession();
  const [period, setPeriod] = useState("4w");
  const [status, setStatus] = useState("active");
  const q = useQuery({ queryKey: ["overview", period, status], queryFn: () => api.overview({ period, status }) });
  const all = useQuery({ queryKey: ["overview", period, "active"], queryFn: () => api.overview({ period, status: "active" }), enabled: status !== "active" });
  const active = status === "active" ? q.data : all.data;
  const counts = active?.counts;
  const latest = q.data?.trend.at(-1);
  const openConcerns = counts ? counts.new + counts.under_review + counts.clarification_requested + counts.in_investigation : undefined;
  const total = counts && openConcerns !== undefined ? openConcerns + counts.follow_ups_active : undefined;
  const priority = active?.queue.find((row) => row.kind === "concern" && row.severity === "high") ?? active?.queue.find((row) => row.kind === "concern");
  const scope = q.data?.scope;
  const scopeLabel = scope?.unit_id ? unitName(scope.unit_id) : scope?.province ?? "All reporting units";

  return (
    <>
      <PageHeader title="Surveillance Overview" description="Monitor reporting reliability, review concerns, and coordinate the next action." />
      <div className="iris-workspace-stack">
        <div className="iris-toolbar">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
            <span className="iris-eyebrow">Simulated reporting workspace</span>
            <span>{meta?.actor.display_name.replace(" (demo)", "")}</span>
            <span>{scopeLabel}</span>
          </div>
          <div className="w-full sm:w-48">
            <label htmlFor="period" className="mb-1 block text-xs text-ink-2">Queue reporting period</label>
            <Select id="period" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="latest">Latest week</option><option value="4w">Last 4 weeks</option>
              <option value="13w">Last 13 weeks</option><option value="all">All weeks</option>
            </Select>
          </div>
        </div>
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data ? <Loading label="Loading overview" /> : (
          <>
            <Panel variant="hero" className="iris-overview-hero" bodyClassName="">
              <p className="iris-eyebrow mb-3">Public-health reporting operations</p>
              <h2>Review reporting gaps and coordinate follow-up.</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink">Review missing or delayed submissions, verify the evidence, and follow through on corrective actions in your reporting scope.</p>
              <p className="mt-4 text-xs text-ink-2">Synthetic demonstration data · Queue: {fmtPeriod(q.data.period.start, q.data.period.end)}. Reporting signals require human verification.</p>
            </Panel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Reporting indicators">
              <MetricCard label="Reporting completeness" value={fmtPct(latest?.completeness)} detail={latest?.completeness == null ? "Not available for this reporting scope." : `Latest week · ${fmtDate(latest.period_start)}`} motif="trends" />
              <MetricCard label="Open reporting concerns" value={fmtNum(openConcerns)} detail="All periods in your reporting scope." motif="verify" />
              <MetricCard label={role === "rhu_staff" ? "Reports and replies due" : "Active follow-up actions"} value={fmtNum(role === "rhu_staff" ? counts?.tasks : counts?.follow_ups_active)} detail={role === "rhu_staff" ? "Outstanding tasks assigned to your unit." : "Approved or in progress across your scope."} motif="records" />
              <MetricCard label="Overdue follow-ups" value={fmtNum(counts?.overdue_follow_ups)} detail="Concerns and actions past their follow-up date." motif="network" />
            </div>
            {all.error && status !== "active" && <ErrorState error={all.error} onRetry={() => all.refetch()} title="Scope-wide indicators could not refresh" />}
            {role === "rhu_staff" && <Panel id="tasks" title={`Your to-do list (${q.data.tasks.length})`} motif="records"><TaskList tasks={q.data.tasks} /></Panel>}
            <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
              <Panel title="Reporting activity" description="Weekly completeness and timeliness · last 12 weeks, independent of the queue filter." motif="trends">
                {q.data.trend.some((point) => point.completeness !== null || point.timeliness !== null) ? (
                  <TrendChart data={q.data.trend} xKey="period_start" series={[{ key: "completeness", label: "Completeness" }, { key: "timeliness", label: "Timeliness" }]} title="Reporting completeness and timeliness" height={235} />
                ) : <EmptyState title="Reporting trend unavailable">This scope does not provide the reporting expectations needed for these metrics.</EmptyState>}
                <p className="mt-3 text-xs text-ink-2">Both measures use expected submissions as the denominator. The latest week can still receive late reports.</p>
                {role && canAccess("/recovery", role) && <Link to="/recovery" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-teal-900 hover:underline">See recovery <ArrowRight className="size-4" aria-hidden /></Link>}
              </Panel>
              <Panel title="Priority concern" description={priority?.severity === "high" ? "A high-priority concern from the selected queue period." : "An open reporting concern from the selected queue period."} motif="verify" className="iris-priority">
                {priority ? (
                  <div className="flex flex-col gap-4">
                    <p className="iris-eyebrow">{priority.concern_type_label}</p>
                    <h3 className="text-lg font-semibold">{priority.title}</h3>
                    <div><QueueStatus row={priority} /></div>
                    <KeyValue items={[{ label: "Affected units", value: fmtNum(priority.units.length) }, { label: "Concern", value: priority.id }, { label: "Reporting period", value: fmtPeriod(priority.period_start, priority.period_end) }, { label: "Assigned to", value: priority.assigned ?? "Unassigned" }]} />
                    <p className="text-xs text-ink-2">Priority is advisory. A reporting signal is not proof of a reporting failure.</p>
                    {role && canAccess(priority.link, role) && <Link to={priority.link} className="iris-button iris-button-primary inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 text-sm font-semibold">Review evidence <ArrowRight className="size-4" aria-hidden /></Link>}
                  </div>
                ) : <EmptyState title="No open concern in this period">Choose a wider queue period to review other reporting concerns.</EmptyState>}
              </Panel>
              <Panel id="queue" title={role === "rhu_staff" ? "Concerns about your unit" : "Work queue"} description="The selected period filters this queue; counters summarize all open items in your scope." motif="records" bodyClassName="p-0">
                <div className="border-b border-line px-4 py-3">
                  <ChipFilter label="Show" value={status} onChange={setStatus} options={[
                    { value: "active", label: "All open", count: total }, { value: "open", label: "New", count: counts?.new },
                    { value: "under_review", label: "Being reviewed", count: counts?.under_review }, { value: "clarification_requested", label: "Waiting for reply", count: counts?.clarification_requested },
                    { value: "in_investigation", label: "Being fixed", count: counts?.in_investigation }, { value: "all", label: "Include closed" },
                  ]} />
                  {!!counts?.overdue_follow_ups && <p className="mt-2 text-xs text-critical-ink">{counts.overdue_follow_ups} overdue follow-up(s) across your scope. Overdue items appear first when included in this queue.</p>}
                </div>
                <QueueTable rows={q.data.queue} emptyState={<div className="p-4"><EmptyState title={status === "active" ? "Nothing needs attention in this period" : "No matching items"}>{status === "active" ? "No open concerns or actions in this period." : <Button variant="secondary" size="sm" onClick={() => setStatus("active")}>Show all open items</Button>}</EmptyState></div>} />
              </Panel>
              <div className="flex min-w-0 flex-col gap-5">
                <Panel title="Workspace context" variant="secondary" motif="network">
                  <KeyValue columns={1} items={[{ label: "Reporting scope", value: scopeLabel }, { label: "Dataset", value: meta?.demo_dataset_id ?? "Unavailable" }, { label: "Data snapshot", value: fmtDate(q.data.dataset_as_of) }, { label: "Environment", value: "Local research prototype · simulated data" }]} />
                </Panel>
                <Panel title="Recently closed" variant="secondary" motif="verify">
                  {q.data.recently_closed.length ? <ul className="flex flex-col gap-4">{q.data.recently_closed.slice(0, 4).map((c) => <li key={c.id} className="text-sm"><Link to={`/investigations/${c.id}`} className="font-medium text-teal-900 hover:underline">{c.title}</Link><p className="mt-1 text-xs text-ink-2">{c.status_label} · {fmtDate(c.closed_at)}</p></li>)}</ul> : <EmptyState title="No recently closed concerns" />}
                </Panel>
              </div>
            </div>
          </>
        )}
        {role && <GettingStarted role={role} />}
      </div>
    </>
  );
}
