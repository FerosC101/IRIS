import { fmtPct } from "@/lib/format";
import type { NetworkNode } from "@/types/api";
import { STATUS_STYLE } from "./NetworkGraph";

const ORDER = [
  { key: "missing", label: "Missing reports" },
  { key: "delayed", label: "Late reports" },
  { key: "normal", label: "Reporting normally" },
  { key: "no_schedule", label: "Nothing due" },
] as const;

/**
 * Shown before a unit is picked: how the visible reporting units are doing in the selected weeks,
 * and which ones to look at first. Hubs are left out of the counts; their figures repeat their units'.
 */
export function NetworkSummary({ nodes, weeks, onSelect }: { nodes: NetworkNode[]; weeks: string; onSelect: (id: string) => void }) {
  const units = nodes.filter((n) => n.unit_type !== "hub");
  if (!units.length) return <p className="text-sm text-ink-2">No units match these filters.</p>;
  const count = (k: string) => units.filter((n) => n.status === k).length;
  const attention = units
    .filter((n) => n.status === "missing" || n.status === "delayed")
    .sort((a, b) => (a.status === b.status ? (a.completeness ?? 1) - (b.completeness ?? 1) : a.status === "missing" ? -1 : 1));
  const withConcerns = units.filter((n) => n.open_concerns > 0).length;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm leading-relaxed text-ink">
        In {weeks}, <strong>{count("missing")}</strong> of {units.length} reporting units had missing reports and <strong>{count("delayed")}</strong> had late ones.
        {withConcerns > 0 && <> {withConcerns} unit{withConcerns === 1 ? " has" : "s have"} open concerns.</>}
      </p>
      <div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-line" role="img"
          aria-label={ORDER.map((s) => `${s.label}: ${count(s.key)}`).join(", ")}>
          {ORDER.map((s) => count(s.key) > 0 && (
            <span key={s.key} style={{ width: `${(count(s.key) / units.length) * 100}%`, background: STATUS_STYLE[s.key].color, opacity: s.key === "no_schedule" ? 0.5 : 1 }} />
          ))}
        </div>
        <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-2">
          {ORDER.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ background: STATUS_STYLE[s.key].color, opacity: s.key === "no_schedule" ? 0.5 : 1 }} aria-hidden />
              {s.label} <span className="font-medium text-ink tabular">{count(s.key)}</span>
            </li>
          ))}
        </ul>
      </div>
      {attention.length > 0 && (
        <section className="border-t border-line pt-4">
          <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-2 uppercase">Look at these first</h3>
          <ul className="flex flex-col gap-1">
            {attention.slice(0, 6).map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => onSelect(n.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-white">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-teal-900">{n.name}</span>
                    <span className="block text-xs text-ink-2">{n.status_label} · {n.province}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-ink-2 tabular">{fmtPct(n.completeness)} arrived</span>
                </button>
              </li>
            ))}
          </ul>
          {attention.length > 6 && <p className="mt-1 px-2 text-xs text-ink-2">and {attention.length - 6} more; use the Status filter to list them.</p>}
        </section>
      )}
      <p className="text-xs text-ink-2">Click any unit in the map, or use the List view, for its details.</p>
    </div>
  );
}
