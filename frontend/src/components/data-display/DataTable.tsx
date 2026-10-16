import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortKey?: string;
  className?: string;
  /** Shown as the label in mobile cards. Defaults to header text. */
  mobileLabel?: string;
  /** Hide this column in the mobile card. */
  hideOnMobile?: boolean;
  align?: "left" | "right";
}

export interface SortState { key: string; order: "asc" | "desc" }

/**
 * Responsive data table: a real <table> from the md breakpoint up, a list of
 * cards below it. Rows are activated by click, Enter or Space; the first cell
 * should also contain a real link for assistive technology.
 */
export function DataTable<T>({
  columns, rows, rowKey, onRowClick, sort, onSort, caption, mobileTitle, emptyState, rowClassName, minWidth = 720,
}: {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void; sort?: SortState; onSort?: (s: SortState) => void;
  caption: string; mobileTitle?: (row: T) => ReactNode; emptyState?: ReactNode; rowClassName?: (row: T) => string | undefined; minWidth?: number;
}) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>;
  const keyDown = (e: KeyboardEvent, row: T) => {
    if (!onRowClick) return;
    if (e.key === "Enter" || e.key === " ") {
      if ((e.target as HTMLElement).closest("a,button")) return;
      e.preventDefault();
      onRowClick(row);
    }
  };
  const toggle = (k: string) => {
    if (!onSort) return;
    onSort({ key: k, order: sort?.key === k && sort.order === "desc" ? "asc" : "desc" });
  };
  return (
    <>
      <div className="hidden overflow-x-auto md:block" role="region" aria-label={caption} tabIndex={0}>
        <table className="w-full border-collapse text-[13.5px]" style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-porcelain text-left">
              {columns.map((c) => {
                const active = sort?.key === (c.sortKey ?? c.key);
                return (
                  <th key={c.key} scope="col" aria-sort={c.sortKey && active ? (sort!.order === "asc" ? "ascending" : "descending") : undefined}
                    className={cn("px-3 py-2 text-xs font-semibold whitespace-nowrap text-ink-2", c.align === "right" && "text-right", c.className)}>
                    {c.sortKey && onSort ? (
                      <button type="button" onClick={() => toggle(c.sortKey!)} className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-teal-900">
                        {c.header}
                        {active ? (sort!.order === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />) : <ArrowUpDown className="size-3.5 opacity-50" aria-hidden />}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} tabIndex={onRowClick ? 0 : undefined} onClick={onRowClick ? (e) => { if (!(e.target as HTMLElement).closest("a,button,input,select")) onRowClick(r); } : undefined}
                onKeyDown={(e) => keyDown(e, r)}
                className={cn("density-row border-b border-line last:border-b-0", onRowClick && "cursor-pointer hover:bg-aqua-50/60 focus-visible:bg-aqua-50", rowClassName?.(r))}>
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2.5 align-top", c.align === "right" && "text-right tabular", c.className)}>{c.cell(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)} className={cn("py-3", rowClassName?.(r))}>
            <div
              role={onRowClick ? "button" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? (e) => { if (!(e.target as HTMLElement).closest("a,button,input,select")) onRowClick(r); } : undefined}
              onKeyDown={(e) => keyDown(e, r)}
              className={cn("block rounded-sm", onRowClick && "cursor-pointer")}
            >
              {mobileTitle && <div className="mb-1.5 text-sm font-medium text-teal-900">{mobileTitle(r)}</div>}
              <dl className="grid grid-cols-[minmax(6.5rem,auto)_1fr] gap-x-3 gap-y-1 text-[13px]">
                {columns.filter((c) => !c.hideOnMobile).map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-ink-2">{c.mobileLabel ?? (typeof c.header === "string" ? c.header : c.key)}</dt>
                    <dd className="min-w-0 break-words text-ink">{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
