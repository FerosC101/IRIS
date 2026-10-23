import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ReportState } from "@/types/api";

export interface HeatCell { column: string; state: ReportState; value: number | null; detail?: string }
export interface HeatRow { key: string; label: ReactNode; cells: HeatCell[]; emphasis?: boolean }

/**
 * Report state by unit and week. Each state has its own fill AND its own text,
 * so it never relies on colour: a count for reports with cases, "0" for a
 * zero-case report (a report), "—" for a missing submission (not a report),
 * "Blank" for a received report without a count. It is a real table, so it
 * doubles as its own data-table view.
 */
export const STATE_LABELS: Record<ReportState, string> = {
  reported: "Cases reported",
  zero: "Zero cases submitted",
  blank: "Received, count left blank",
  missing: "Missing submission",
  not_expected: "Not expected",
};

const CELL: Record<ReportState, string> = {
  reported: "bg-nav text-white",
  zero: "bg-mint text-ink",
  blank: "border border-dashed border-ink-2 bg-white text-ink-2",
  missing: "border border-missing bg-missing-pale text-critical-ink",
  not_expected: "bg-transparent text-ink-2",
};

function cellText(c: HeatCell): string {
  if (c.state === "missing") return "—";
  if (c.state === "blank") return "Blank";
  if (c.state === "not_expected") return "";
  return String(c.value ?? 0);
}

export function Heatmap({ caption, columns, rows, onSelect, selected, legend = true, rowHeader = "Reporting unit" }: {
  caption: string; columns: { key: string; label: string }[]; rows: HeatRow[];
  onSelect?: (rowKey: string, column: string) => void; selected?: { row: string; column: string } | null;
  legend?: boolean; rowHeader?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] border-separate border-spacing-[4px] text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="px-1 text-left text-[10px] font-medium tracking-wide text-ink-2 uppercase">{rowHeader}</th>
              {columns.map((c) => <th key={c.key} scope="col" className="text-center text-[10px] font-medium text-ink-2 uppercase">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className={cn("px-1 text-left text-[13px] font-normal whitespace-nowrap text-ink", r.emphasis && "font-semibold text-teal-800")}>{r.label}</th>
                {columns.map((col) => {
                  const c = r.cells.find((x) => x.column === col.key) ?? { column: col.key, state: "not_expected" as const, value: null };
                  const label = `${typeof r.label === "string" ? r.label : r.key}, ${col.label}: ${STATE_LABELS[c.state]}${c.state === "reported" ? `, ${c.value} cases` : ""}`;
                  const isSel = selected?.row === r.key && selected.column === col.key;
                  const content = (
                    <button type="button" disabled={!onSelect || c.state === "not_expected"} aria-label={label} aria-pressed={onSelect ? isSel : undefined}
                      onClick={() => onSelect?.(r.key, col.key)}
                      className={cn("flex h-7 w-full min-w-11 items-center justify-center rounded-[3px] text-[11px] font-medium tabular transition-[filter,box-shadow]",
                        CELL[c.state], onSelect && c.state !== "not_expected" && "hover:brightness-110 hover:shadow-[0_0_0_2px_var(--color-teal-800)]",
                        isSel && "shadow-[0_0_0_2px_var(--color-teal-800)]", "disabled:cursor-default")}>
                      <span aria-hidden>{cellText(c)}</span>
                    </button>
                  );
                  return (
                    <td key={col.key} className="p-0">
                      {c.state === "not_expected" ? content : <Tooltip content={<><span className="font-semibold">{STATE_LABELS[c.state]}</span>{c.state === "reported" ? ` · ${c.value} cases` : ""}{c.detail ? <><br />{c.detail}</> : null}</>}>{content}</Tooltip>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {legend && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-ink-2" aria-label="Legend">
          {(["reported", "zero", "missing", "blank"] as const).map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("inline-flex h-3 w-4 items-center justify-center rounded-[2px] text-[8px]", CELL[s])} />
              {STATE_LABELS[s]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
