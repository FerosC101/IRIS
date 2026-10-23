import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DataTableToggle, SimpleTable } from "./table-view";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  /** A CSS colour or token, e.g. "var(--color-chart-zero)". Ignored when `pattern` is set. */
  color: string;
  /** "hatch" draws a neutral diagonal texture, for states such as "blank" that are not a hue. */
  pattern?: "hatch";
}

const R = 60, STROKE = 16, C = 2 * Math.PI * R, GAP = 2;

/**
 * Part-to-whole ring (with cases / zero-case / missing). Every segment is a
 * focusable button with its own tooltip; the legend lists every value, and a
 * data table is available, so nothing depends on colour or hovering.
 * Segments are separated by a 2px surface gap.
 */
export function Donut({ segments, centerValue, centerLabel, title, onSelect, selectedKey, size = 152, className, note }: {
  segments: DonutSegment[]; centerValue: ReactNode; centerLabel: string; title: string;
  onSelect?: (key: string) => void; selectedKey?: string | null; size?: number; className?: string; note?: ReactNode;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const hatchId = useId();
  const total = segments.reduce((s, x) => s + x.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  let offset = 0;
  const arcs = shown.map((s) => {
    const len = total ? (s.value / total) * C : 0;
    const arc = { ...s, dash: Math.max(0, len - (shown.length > 1 ? GAP : 0)), offset };
    offset += len;
    return arc;
  });
  const active = segments.find((s) => s.key === (hover ?? selectedKey));
  const pct = (v: number) => (total ? `${Math.round((v / total) * 1000) / 10}%` : "—");
  return (
    <figure className={cn("flex flex-col gap-3", className)} aria-label={title}>
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg viewBox="0 0 152 152" width={size} height={size} role="group" aria-label={`${title}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
            <defs>
              <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="#FFFFFF" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-ink-2)" strokeWidth="2" />
              </pattern>
            </defs>
            <circle cx="76" cy="76" r={R} fill="none" stroke="var(--color-flow)" strokeWidth={STROKE} />
            {arcs.map((a) => {
              const on = hover === a.key || selectedKey === a.key;
              return (
                <circle key={a.key} cx="76" cy="76" r={R} fill="none" transform="rotate(-90 76 76)"
                  stroke={a.pattern === "hatch" ? `url(#${hatchId})` : a.color} strokeWidth={on ? STROKE + 4 : STROKE}
                  strokeDasharray={`${a.dash} ${C - a.dash}`} strokeDashoffset={-a.offset}
                  className={cn("transition-[stroke-width]", onSelect && "cursor-pointer")}
                  tabIndex={0} role={onSelect ? "button" : "img"} aria-pressed={onSelect ? selectedKey === a.key : undefined}
                  aria-label={`${a.label}: ${a.value} (${pct(a.value)})`}
                  onMouseEnter={() => setHover(a.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(a.key)} onBlur={() => setHover(null)}
                  onClick={() => onSelect?.(a.key)} onKeyDown={(e) => { if (onSelect && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(a.key); } }} />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden>
            <span className="font-display text-[32px] leading-none font-medium text-ink">{active ? active.value : centerValue}</span>
            <span className="mt-1 text-[11px] text-ink-2">{active ? active.label.toLowerCase() : centerLabel}</span>
          </div>
        </div>
        <ul className="flex min-w-[12rem] flex-1 flex-col gap-2.5" aria-label={`${title} legend`}>
          {segments.map((s) => (
            <li key={s.key}>
              <button type="button" disabled={!onSelect} onClick={() => onSelect?.(s.key)} aria-pressed={onSelect ? selectedKey === s.key : undefined}
                onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}
                className={cn("flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left text-[13px] text-ink-2 disabled:cursor-default",
                  onSelect && "hover:bg-tint", (hover === s.key || selectedKey === s.key) && "bg-tint text-ink")}>
                <span aria-hidden className="size-2.5 shrink-0 rounded-full border border-line-strong"
                  style={s.pattern === "hatch" ? { background: "repeating-linear-gradient(45deg,#fff 0 2px,var(--color-ink-2) 2px 4px)" } : { background: s.color, borderColor: s.color }} />
                <span className="flex-1">{s.label}</span>
                <span className="font-semibold text-ink tabular">{String(s.value).padStart(2, "0")}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {note && <figcaption className="text-xs text-ink-2">{note}</figcaption>}
      <DataTableToggle>
        <SimpleTable head={["State", "Units", "Share"]} rows={segments.map((s) => [s.label, s.value, pct(s.value)])} />
      </DataTableToggle>
    </figure>
  );
}
