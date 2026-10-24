import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConcernStatusBadge, OverdueBadge, VerificationBadge } from "@/components/data-display/badges";
import { DataTable, type SortState } from "@/components/data-display/DataTable";
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

export function PriorityLabel({ severity }: { severity: QueueRow["severity"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap text-ink">
      <span className={cn("size-2 shrink-0 rounded-full", DOT[severity])} aria-hidden />
      {SEVERITY[severity].label.replace(" priority", "")}
    </span>
  );
}

/**
 * Work items as a table: priority, what the issue is, which weeks, where it stands and who has it.
 * Each row opens the item; below the md breakpoint the rows become cards. Used wherever concerns are
 * listed, so a concern looks the same on every screen.
 */
export function QueueTable({ rows, caption = "Work queue", emptyState, sort, onSort, showVerification = false }: {
  rows: QueueRow[]; caption?: string; emptyState?: ReactNode; sort?: SortState; onSort?: (s: SortState) => void; showVerification?: boolean;
}) {
  const { categoryName } = useSession();
  const nav = useNavigate();
  if (!rows.length && emptyState) return <>{emptyState}</>;
  const detail = (r: QueueRow) => {
    const cats = r.category ? r.category.split(", ").map((c) => categoryName(c)).join(", ") : null;
    return [r.kind === "follow_up" ? "Follow-up action" : r.id, r.kind === "follow_up" ? null : r.concern_type_label, cats].filter(Boolean).join(" · ");
  };
  return (
    <DataTable caption={caption} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => nav(r.link)} minWidth={820} sort={sort} onSort={onSort} emptyState={emptyState}
      mobileTitle={(r) => <Link to={r.link} className="hover:underline">{r.title}</Link>}
      columns={[
        { key: "priority", header: "Priority", sortKey: "severity", cell: (r) => <PriorityLabel severity={r.severity} /> },
        { key: "issue", header: "Issue", hideOnMobile: true, className: "w-[42%] min-w-[18rem]", cell: (r) => (
          <div className="min-w-0">
            <Link to={r.link} className="font-medium text-ink hover:text-teal-900 hover:underline">{r.title}</Link>
            <p className="mt-0.5 text-xs text-ink-2">{detail(r)}</p>
          </div>
        ) },
        { key: "type", header: "Type", mobileLabel: "Type", cell: (r) => <span className="text-[13px] text-ink-2 md:hidden">{detail(r)}</span>, className: "md:hidden" },
        { key: "weeks", header: "Weeks", sortKey: "period_start", cell: (r) => <span className="text-[13px] whitespace-nowrap">{fmtPeriod(r.period_start, r.period_end)}</span> },
        { key: "status", header: "Status", cell: (r) => <span className="flex flex-wrap items-center gap-1.5 whitespace-nowrap"><QueueStatus row={r} />{r.overdue && <OverdueBadge />}{showVerification && r.kind === "concern" && <VerificationBadge verification={r.verification ?? "unverified"} />}</span> },
        { key: "owner", header: "Owner", cell: (r) => (r.assigned ? <span className="text-[13px]">{r.assigned.replace(" (demo)", "")}</span> : <span className="text-[13px] text-ink-2 italic">Unassigned</span>) },
        { key: "updated", header: "Updated", align: "right", hideOnMobile: true, sortKey: "updated_at", cell: (r) => <span className="text-[13px] whitespace-nowrap text-ink-2">{fmtDate(r.updated_at)}</span> },
      ]} />
  );
}
