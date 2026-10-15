import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ConcernStatusBadge, OverdueBadge } from "@/components/data-display/badges";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/hooks/useSession";
import { fmtDate, fmtPeriod } from "@/lib/format";
import { ASSIGNMENT_STATUS, SEVERITY } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { AssignmentStatus, ConcernStatus, QueueRow } from "@/types/api";

const DOT = { high: "bg-critical", medium: "bg-attention", low: "bg-ink-2/40" } as const;

export function QueueStatus({ row }: { row: QueueRow }) {
  if (row.kind === "follow_up") {
    const s = ASSIGNMENT_STATUS[row.status as AssignmentStatus];
    return <Badge tone={s?.tone ?? "info"}>{s?.label ?? row.status_label}</Badge>;
  }
  return <ConcernStatusBadge status={row.status as ConcernStatus} />;
}

/**
 * Work items as a simple list: what it is, where, when, and its status.
 * (Kept under the old name so existing imports keep working.)
 */
export function QueueTable({ rows, caption = "Work queue", emptyState }: { rows: QueueRow[]; caption?: string; emptyState?: ReactNode; sort?: unknown; onSort?: unknown }) {
  const { categoryName } = useSession();
  if (!rows.length && emptyState) return <>{emptyState}</>;
  return (
    <ul aria-label={caption} className="divide-y divide-line">
      {rows.map((r) => {
        const cats = r.category ? r.category.split(", ").map((c) => categoryName(c)).join(", ") : null;
        return (
          <li key={r.id} className="density-row">
            <Link to={r.link} className="group flex items-start gap-3 px-4 py-3 hover:bg-aqua-50/60 focus-visible:bg-aqua-50">
              <span className={cn("mt-2 size-2.5 shrink-0 rounded-full", DOT[r.severity])} title={SEVERITY[r.severity].label} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <span className="text-[15px] font-medium text-ink group-hover:text-teal-900">
                    {r.kind === "follow_up" && <span className="font-normal text-ink-2">Action: </span>}
                    {r.title}
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-1.5"><QueueStatus row={r} />{r.overdue && <OverdueBadge />}</span>
                </span>
                <span className="mt-0.5 block text-[13px] text-ink-2">
                  <span className="sr-only">{SEVERITY[r.severity].label}. </span>
                  {r.units_label}
                  {cats && <> · {cats}</>}
                  {" · "}{fmtPeriod(r.period_start, r.period_end)}
                  {r.assigned && <> · {r.assigned}</>}
                  <span className="hidden md:inline"> · updated {fmtDate(r.updated_at)}</span>
                </span>
              </span>
              <ChevronRight className="mt-1 size-4 shrink-0 text-ink-2/60 group-hover:text-teal-900" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
