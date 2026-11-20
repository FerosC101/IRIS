import { fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NetworkNode } from "@/types/api";

/**
 * Shown before a unit is picked: a dot per reporting unit, grouped by province, so a cluster of red reads at a
 * glance; then the share of reports that arrived through each hub. Hubs are left out of the unit dots.
 */
export function NetworkSummary({ nodes, weeks, thresholds, onSelect }: {
  nodes: NetworkNode[]; weeks: string; thresholds: { completeness: number }; onSelect: (id: string) => void;
}) {
  const units = nodes.filter((n) => n.unit_type !== "hub");
  const hubs = nodes.filter((n) => n.unit_type === "hub").sort((a, b) => (a.completeness ?? 1) - (b.completeness ?? 1));
  if (!units.length) return <p className="text-sm text-ink-2">No units match these filters.</p>;
  const provinces = [...new Set(units.map((n) => n.province))].sort();
  const missing = units.filter((n) => n.status === "missing").length;
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="by-province" data-tour="network-provinces">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="by-province" className="text-[13px] font-semibold text-ink">Missing by province</h3>
          <span className="text-xs text-ink-2 tabular">{missing} of {units.length} units</span>
        </div>
        <ul className="mt-3 flex flex-col gap-3">
          {provinces.map((p) => {
            const here = units.filter((n) => n.province === p).sort((a, b) => Number(b.status === "missing") - Number(a.status === "missing"));
            const out = here.filter((n) => n.status === "missing").length;
            return (
              <li key={p} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-2">
                <span className="text-[13px] text-ink">{p}</span>
                <span className="flex flex-wrap gap-1.5">
                  {here.map((n) => (
                    <button key={n.id} type="button" onClick={() => onSelect(n.id)} title={`${n.name}: ${n.status_label}`} aria-label={`${n.name}: ${n.status_label}`}
                      className={cn("size-3.5 rounded-full transition-transform hover:scale-125",
                        n.status === "missing" ? "bg-white ring-2 ring-critical ring-inset" : n.status === "delayed" ? "bg-attention" : n.status === "no_schedule" ? "bg-line-strong" : "bg-teal-600")} />
                  ))}
                </span>
                <span className={cn("text-right text-[13px] font-semibold tabular", out ? "text-critical-ink" : "text-ink-2")}>{out}/{here.length}</span>
              </li>
            );
          })}
        </ul>
      </section>
      {hubs.length > 0 && (
        <section aria-labelledby="hub-arrival" className="border-t border-line pt-4">
          <h3 id="hub-arrival" className="text-[13px] font-semibold text-ink">Reports through each hub</h3>
          <ul className="mt-3 flex flex-col gap-2.5">
            {hubs.map((h) => {
              const low = h.completeness !== null && h.completeness < thresholds.completeness;
              return (
                <li key={h.id}>
                  <button type="button" onClick={() => onSelect(h.id)} className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)_2.75rem] items-center gap-2 text-left">
                    <span className="truncate text-[13px] text-ink" title={h.name}>{h.name.replace(/ (Provincial )?Reporting Hub$/, "")}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-tint" aria-hidden><span className={cn("block h-full rounded-full", low ? "bg-critical" : "bg-teal-600")} style={{ width: `${(h.completeness ?? 0) * 100}%` }} /></span>
                    <span className={cn("text-right text-[13px] font-semibold tabular", low ? "text-critical-ink" : "text-ink")}>{fmtPct(h.completeness)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <p className="text-xs text-ink-2">{weeks}. Click a dot or a unit on the graph for its details.</p>
    </div>
  );
}
