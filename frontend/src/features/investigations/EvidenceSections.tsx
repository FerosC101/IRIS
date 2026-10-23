import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { EvidenceKindBadge } from "@/components/data-display/badges";
import { SimpleTable } from "@/components/data-display/charts";
import { useSession } from "@/hooks/useSession";
import { fmtNum, fmtPct, fmtPeriod } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConcernDetail, Evidence, TimelineRow } from "@/types/api";

/** Collapsible section; open by default, collapsible on every screen size. */
export function Section({ title, children, defaultOpen = true, id, count }: { title: string; children: ReactNode; defaultOpen?: boolean; id?: string; count?: number }) {
  return (
    <details id={id} open={defaultOpen} className="group min-w-0 rounded-md border border-line bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <h2 className="text-[15px] font-semibold">
          {title}
          {count !== undefined && <span className="ml-1.5 text-sm font-normal text-ink-2">({count})</span>}
        </h2>
        <ChevronDown className="size-4 shrink-0 text-ink-2 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}

export function EvidenceList({ items }: { items: Evidence[] }) {
  const { unitName, categoryName } = useSession();
  if (!items.length) return <p className="text-sm text-ink-2">None recorded.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {items.map((e) => {
        const perUnit = (e.data.per_unit as { unit_id: string; name: string; expected: number; on_time: number; late: number; not_received: number }[] | undefined) ?? null;
        const byCat = (e.data.by_category as { category: string; observed: number; expected: number | null }[] | undefined) ?? null;
        return (
          <li key={e.id} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {e.kind !== "observed" && <EvidenceKindBadge kind={e.kind} />}
              <p className="text-sm font-medium text-ink">{e.title}</p>
            </div>
            <p className="text-sm text-ink">{e.detail}</p>
            {e.created_by && <p className="text-xs text-ink-2">Recorded by {e.created_by}</p>}
            {perUnit && (
              <div className="overflow-x-auto rounded-sm border border-line">
                <SimpleTable head={["Unit", "Expected", "On time", "Late", "Not received"]} rows={perUnit.map((u) => [u.name ?? unitName(u.unit_id), u.expected, u.on_time, u.late, u.not_received])} />
              </div>
            )}
            {byCat && (
              <div className="overflow-x-auto rounded-sm border border-line">
                <SimpleTable head={["Category", "Reported in period", "Expected from recent weeks"]}
                  rows={byCat.map((c) => [categoryName(c.category), fmtNum(c.observed), c.expected === null ? "Insufficient history" : `≈ ${fmtNum(c.expected, 1)}`])} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Cell({ n, of, tone }: { n: number; of: number; tone: "ok" | "late" | "miss" }) {
  if (n === 0) return <span className="text-ink-2">0</span>;
  return <span className={cn("font-medium tabular", tone === "miss" ? "text-critical-ink" : tone === "late" ? "text-attention-ink" : "text-ink")}>{n}<span className="sr-only"> of {of}</span></span>;
}

/** Week-by-week observations for each affected unit (observed in dataset). */
export function ObservationTimeline({ detail }: { detail: ConcernDetail }) {
  const { unitName } = useSession();
  const weeks = new Map(detail.timeline.weeks.map((w) => [w.week, w]));
  const units = Object.entries(detail.timeline.units);
  const isCount = detail.concern.concern_type === "count_drop" || detail.concern.concern_type === "zero_case_run";
  if (!units.length) return <p className="text-sm text-ink-2">No week-level observations were stored for this concern.</p>;
  return (
    <div className="flex flex-col gap-5">
      {units.map(([uid, rows]) => (
        <div key={uid}>
          {units.length > 1 && <h3 className="mb-1.5 text-sm font-semibold text-ink">{unitName(uid)}</h3>}
          <div className="overflow-x-auto rounded-sm border border-line">
            <table className="w-full min-w-[34rem] text-[13px]">
              <caption className="sr-only">Weekly observations for {unitName(uid)}</caption>
              <thead className="bg-porcelain text-left text-xs text-ink-2">
                <tr>
                  <th scope="col" className="px-2.5 py-1.5 font-semibold">Week</th>
                  <th scope="col" className="px-2.5 py-1.5 text-right font-semibold">Expected</th>
                  <th scope="col" className="px-2.5 py-1.5 text-right font-semibold">On time</th>
                  <th scope="col" className="px-2.5 py-1.5 text-right font-semibold">Late</th>
                  <th scope="col" className="px-2.5 py-1.5 text-right font-semibold">Not received</th>
                  {isCount ? <th scope="col" className="px-2.5 py-1.5 text-right font-semibold">Cases (expected)</th> : <th scope="col" className="px-2.5 py-1.5 text-right font-semibold">Incomplete</th>}
                  <th scope="col" className="px-2.5 py-1.5 font-semibold">Flagged</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: TimelineRow) => (
                  <tr key={r.week} className={cn("border-t border-line", r.in_concern && "bg-mist-50/70")}>
                    <th scope="row" className="px-2.5 py-1.5 text-left font-normal whitespace-nowrap">
                      {weeks.get(r.week) ? fmtPeriod(weeks.get(r.week)!.start, weeks.get(r.week)!.end) : `Week ${r.week}`}
                      {r.in_concern && <span className="ml-1.5 text-[11px] font-medium text-info-ink">in concern</span>}
                    </th>
                    <td className="px-2.5 py-1.5 text-right tabular">{r.expected}</td>
                    <td className="px-2.5 py-1.5 text-right"><Cell n={r.on_time} of={r.expected} tone="ok" /></td>
                    <td className="px-2.5 py-1.5 text-right"><Cell n={r.late} of={r.expected} tone="late" /></td>
                    <td className="px-2.5 py-1.5 text-right"><Cell n={r.not_received} of={r.expected} tone="miss" /></td>
                    {isCount ? (
                      <td className="px-2.5 py-1.5 text-right tabular">{fmtNum(r.cases)}{r.count_expected !== null && <span className="text-ink-2"> ({fmtNum(r.count_expected, 0)})</span>}</td>
                    ) : <td className="px-2.5 py-1.5 text-right"><Cell n={r.incomplete} of={r.expected} tone="late" /></td>}
                    <td className="px-2.5 py-1.5">{r.flagged ? <span className="text-xs font-medium text-ink">Yes</span> : <span className="text-xs text-ink-2">No</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="text-xs text-ink-2">Each week is reviewed seven days after its due date. Reports arriving later count as not received for detection, but still count toward completeness.</p>
    </div>
  );
}

export function TechnicalDetails({ detail }: { detail: ConcernDetail }) {
  const c = detail.concern;
  const rows = Object.values(detail.timeline.units).flat().filter((r) => r.in_concern);
  const p = detail.detection_params;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>{c.uncertainty_note}</p>
      <div className="overflow-x-auto rounded-sm border border-line">
        <SimpleTable head={["Week", "Delay share", "Usual (median)", "Own z-score", "Network support", "Score"]}
          rows={rows.map((r) => [r.week, fmtPct(r.deficit), fmtPct(r.baseline_median), r.own_z.toFixed(1), fmtPct(r.peer_support), r.score.toFixed(1)])} />
      </div>
      <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
        <li>Delay share = (½ × late reports + reports not received) ÷ expected reports for the week.</li>
        <li>Own z-score compares the delay share with the unit's previous {p.history_weeks ?? 8} weeks (median and spread; minimum spread {p.scale_floor ?? 0.15}).</li>
        {c.detection_method === "network" && <li>Network support = share of connected units (same reporting hub or shared resource) that were also delayed. Score = z + {p.peer_weight ?? 3} × support; a unit is flagged at ≥ {p.network_score ?? 4.5} and only with some delay of its own.</li>}
        <li>Count drops use a Poisson lower-tail probability below {p.count_p ?? 0.001}, assessed only when most reports were received.</li>
      </ul>
    </div>
  );
}
