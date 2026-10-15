import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileWarning, MessageSquareReply } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { MiniTrend } from "@/components/data-display/charts";
import { ChipFilter } from "@/components/data-display/FilterBar";
import { PageHeader } from "@/components/data-display/PageHeader";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { fmtDate, fmtPct, fmtPeriod } from "@/lib/format";
import { canAccess } from "@/lib/navigation";
import { api } from "@/services/api";
import type { Task } from "@/types/api";
import { GettingStarted } from "./GettingStarted";
import { QueueTable } from "./QueueTable";
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
  const { meta, role } = useSession();
  const [period, setPeriod] = useState("4w");
  const [status, setStatus] = useState("active");
  const q = useQuery({ queryKey: ["overview", period, status], queryFn: () => api.overview({ period, status }) });
  const all = useQuery({ queryKey: ["overview", period, "active"], queryFn: () => api.overview({ period, status: "active" }), enabled: status !== "active" });
  const counts = (status === "active" ? q.data : all.data)?.counts;
  const latest = q.data?.trend.at(-1);
  const total = counts ? counts.new + counts.under_review + counts.clarification_requested + counts.in_investigation + counts.follow_ups_active : undefined;
  const firstName = meta?.actor.display_name.replace(" (demo)", "");

  return (
    <>
      <PageHeader title="What needs attention" description={firstName ? `Signed in as ${firstName}.` : undefined}
        actions={
          <div className="w-full sm:w-44">
            <label htmlFor="period" className="sr-only">Reporting period</label>
            <Select id="period" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="latest">Latest week</option>
              <option value="4w">Last 4 weeks</option>
              <option value="13w">Last 13 weeks</option>
              <option value="all">All weeks</option>
            </Select>
          </div>
        } />
      {role && <div className="mb-5"><GettingStarted role={role} /></div>}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data ? <Loading label="Loading" /> : (
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-5">
            {role === "rhu_staff" && (
              <Panel id="tasks" title={`Your to-do list${q.data.tasks.length ? ` (${q.data.tasks.length})` : ""}`}>
                <TaskList tasks={q.data.tasks} />
              </Panel>
            )}
            <Panel id="queue" title={role === "rhu_staff" ? "Concerns about your unit" : "Open items"} bodyClassName="p-0">
              <div className="border-b border-line px-4 py-3">
                <ChipFilter label="Show" value={status} onChange={setStatus} options={[
                  { value: "active", label: "All open", count: total },
                  { value: "open", label: "New", count: counts?.new },
                  { value: "under_review", label: "Being reviewed", count: counts?.under_review },
                  { value: "clarification_requested", label: "Waiting for reply", count: counts?.clarification_requested },
                  { value: "in_investigation", label: "Being fixed", count: counts?.in_investigation },
                  { value: "all", label: "Include closed" },
                ]} />
                {!!counts?.overdue_follow_ups && <p className="mt-2 text-[13px] font-medium text-critical-ink">{counts.overdue_follow_ups} item(s) are overdue and shown first.</p>}
              </div>
              <QueueTable rows={q.data.queue}
                emptyState={<div className="p-4"><EmptyState title={status === "active" ? "Nothing needs attention right now" : "Nothing here"}>
                  {status === "active" ? "No open concerns or actions in this period." : <Button variant="secondary" size="sm" onClick={() => setStatus("active")}>Show all open items</Button>}
                </EmptyState></div>} />
            </Panel>
          </div>

          <div className="grid min-w-0 grid-cols-1 content-start gap-5 md:grid-cols-2 2xl:grid-cols-1">
            <Panel title="Reports received">
              {latest?.completeness == null ? <p className="text-sm text-ink-2">Not available for your view.</p> : (
                <>
                  <p className="text-3xl font-semibold text-teal-900 tabular">{fmtPct(latest.completeness)}</p>
                  <p className="text-[13px] text-ink-2">of expected reports arrived in the latest week ({fmtPct(latest.timeliness)} on time)</p>
                  <MiniTrend data={q.data.trend} xKey="period_start" yKey="completeness" label="Reports received" />
                  <p className="text-xs text-ink-2">Last 12 weeks. The latest week can still get late reports.</p>
                </>
              )}
              {role && canAccess("/recovery", role) && (
                <Link to="/recovery" className="mt-2 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-teal-900 hover:underline sm:min-h-0">
                  See recovery <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              )}
            </Panel>
            {q.data.recently_closed.length > 0 && (
              <Panel title="Recently closed">
                <ul className="flex flex-col gap-3">
                  {q.data.recently_closed.slice(0, 4).map((c) => (
                    <li key={c.id} className="text-sm">
                      <Link to={`/investigations/${c.id}`} className="font-medium text-teal-900 hover:underline">{c.title}</Link>
                      <p className="text-xs text-ink-2">{c.status === "resolved" ? "Resolved" : "Not a problem"} · {fmtDate(c.closed_at)}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      )}
    </>
  );
}
