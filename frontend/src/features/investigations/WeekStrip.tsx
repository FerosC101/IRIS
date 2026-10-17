import { Check, Clock, X } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { fmtShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConcernDetail, TimelineRow } from "@/types/api";

type CellKind = "ok" | "late" | "missing" | "incomplete";

function kind(r: TimelineRow): CellKind {
  if (r.not_received > 0) return "missing";
  if (r.late > 0) return "late";
  if (r.incomplete > 0) return "incomplete";
  return "ok";
}

const STYLE: Record<CellKind, string> = {
  ok: "bg-positive-bg text-positive-ink",
  late: "bg-attention-bg text-attention-ink",
  missing: "bg-critical-bg text-critical-ink",
  incomplete: "bg-attention-bg text-attention-ink",
};
const TEXT: Record<CellKind, string> = { ok: "all on time", late: "some late", missing: "some missing", incomplete: "incomplete forms" };

function Icon({ k }: { k: CellKind }) {
  if (k === "ok") return <Check className="size-4" aria-hidden />;
  if (k === "late") return <Clock className="size-4" aria-hidden />;
  if (k === "missing") return <X className="size-4" aria-hidden />;
  return <span aria-hidden className="text-xs font-bold">½</span>;
}

/** A compact unit × week grid: one glance shows when reporting broke down. */
export function WeekStrip({ detail }: { detail: ConcernDetail }) {
  const { unitName } = useSession();
  const weeks = detail.timeline.weeks;
  const units = Object.entries(detail.timeline.units);
  const isCount = detail.concern.concern_type === "count_drop";
  const inConcern = new Set(Object.values(detail.timeline.units).flat().filter((r) => r.in_concern).map((r) => r.week));
  if (!units.length) return <p className="text-sm text-ink-2">No weekly data was stored for this concern.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto" role="region" aria-label="Weekly reporting timeline" tabIndex={0}>
        <table className="border-separate border-spacing-1 text-[13px]">
          <caption className="sr-only">Weekly reporting for the affected units</caption>
          <thead>
            <tr>
              <th scope="col" className="sr-only">Unit</th>
              {weeks.map((w) => (
                <th key={w.week} scope="col" className={cn("min-w-12 rounded-sm px-1 py-1 text-center text-[11px] font-medium text-ink-2", inConcern.has(w.week) && "bg-mist-50 text-info-ink")}>
                  {fmtShortDate(w.start)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {units.map(([uid, rows]) => {
              const byWeek = new Map(rows.map((r) => [r.week, r]));
              return (
                <tr key={uid}>
                  <th scope="row" className="pr-2 text-left font-medium whitespace-nowrap text-ink">{unitName(uid)}</th>
                  {weeks.map((w) => {
                    const r = byWeek.get(w.week);
                    if (!r) return <td key={w.week} />;
                    if (isCount) {
                      const low = r.count_expected !== null && r.cases < 0.5 * r.count_expected;
                      return (
                        <td key={w.week} className={cn("h-10 rounded-sm text-center tabular", low ? "bg-critical-bg font-semibold text-critical-ink" : "bg-porcelain text-ink")}
                          title={`${r.cases} cases${r.count_expected !== null ? `, about ${Math.round(r.count_expected)} expected` : ""}`}>
                          {r.cases}<span className="sr-only">{r.count_expected !== null ? ` cases, about ${Math.round(r.count_expected)} expected` : " cases"}</span>
                        </td>
                      );
                    }
                    const k = kind(r);
                    return (
                      <td key={w.week} className={cn("h-10 rounded-sm text-center", STYLE[k])} title={`${r.on_time} on time, ${r.late} late, ${r.not_received} missing of ${r.expected}`}>
                        <span className="flex items-center justify-center"><Icon k={k} /></span>
                        <span className="sr-only">{TEXT[k]}: {r.on_time} on time, {r.late} late, {r.not_received} missing of {r.expected}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
        {isCount ? (
          <>
            <li>Numbers are reported cases per week.</li>
            <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-critical-bg" aria-hidden /> Less than half of what was expected</li>
          </>
        ) : (
          <>
            <li className="flex items-center gap-1"><span className="rounded-sm bg-positive-bg p-0.5 text-positive-ink"><Check className="size-3" aria-hidden /></span> All on time</li>
            <li className="flex items-center gap-1"><span className="rounded-sm bg-attention-bg p-0.5 text-attention-ink"><Clock className="size-3" aria-hidden /></span> Some late</li>
            <li className="flex items-center gap-1"><span className="rounded-sm bg-critical-bg p-0.5 text-critical-ink"><X className="size-3" aria-hidden /></span> Some missing</li>
            <li className="flex items-center gap-1"><span className="rounded-sm bg-attention-bg px-1 text-[10px] font-bold text-attention-ink">½</span> Forms incomplete</li>
          </>
        )}
        <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-mist-50" aria-hidden /> Weeks in this concern</li>
      </ul>
    </div>
  );
}
