import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ReportState } from "@/types/api";

export interface MapProvince { name: string; outline: [number, number][] }
export interface MapPoint { id: string; label: string; x: number; y: number; state: ReportState | "hub"; detail?: string }

const FILL: Record<MapPoint["state"], string> = {
  reported: "var(--color-chart-reported)",
  zero: "var(--color-chart-zero)",
  missing: "#FFFFFF",
  blank: "#FFFFFF",
  not_expected: "var(--color-line-strong)",
  hub: "var(--color-nav)",
};
const STATE_TEXT: Record<MapPoint["state"], string> = {
  reported: "cases reported", zero: "zero-case report", missing: "missing submission", blank: "count left blank", not_expected: "not expected", hub: "reporting hub",
};

/**
 * Schematic map shell: fictional province outlines from the backend and one
 * marker per unit. Markers are focusable buttons; missing and blank markers
 * are hollow (ring in the missing colour / dashed), so state is not colour
 * alone. A list view lists the same points for anyone who prefers it.
 */
export function SchematicMap({ provinces, points, width = 1000, height = 1000, selectedId, onSelect, title, note, className }: {
  provinces: MapProvince[]; points: MapPoint[]; width?: number; height?: number; selectedId?: string | null;
  onSelect?: (id: string) => void; title: string; note?: ReactNode; className?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [list, setList] = useState(false);
  const xs = points.map((p) => p.x).concat(provinces.flatMap((p) => p.outline.map((o) => o[0])));
  const ys = points.map((p) => p.y).concat(provinces.flatMap((p) => p.outline.map((o) => o[1])));
  const pad = 40;
  const box = xs.length ? [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2] : [0, 0, width, height];
  const tip = points.find((p) => p.id === hover);
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <figcaption className="text-xs text-ink-2">{note ?? "Schematic geography. Places are fictional."}</figcaption>
        <button type="button" className="text-xs font-medium text-teal-800 hover:underline" aria-pressed={list} onClick={() => setList((l) => !l)}>{list ? "Show map" : "Show as list"}</button>
      </div>
      {list ? (
        <ul className="divide-y divide-line rounded-md border border-line text-[13px]" aria-label={`${title} (list)`}>
          {points.map((p) => (
            <li key={p.id}>
              <button type="button" disabled={!onSelect} onClick={() => onSelect?.(p.id)} aria-pressed={onSelect ? selectedId === p.id : undefined}
                className={cn("flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-tint disabled:cursor-default", selectedId === p.id && "bg-tint")}>
                <span>{p.label}</span><span className="text-ink-2">{STATE_TEXT[p.state]}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="relative rounded-md bg-mint-wash">
          <svg viewBox={box.join(" ")} className="block h-auto w-full" role="group" aria-label={title}>
            {provinces.map((p) => (
              <g key={p.name}>
                <polygon points={p.outline.map((o) => o.join(",")).join(" ")} fill="var(--color-mint)" stroke="var(--color-nav)" strokeWidth="2" strokeLinejoin="round" />
                <text x={p.outline.reduce((s, o) => s + o[0], 0) / p.outline.length} y={Math.min(...p.outline.map((o) => o[1])) + 30} textAnchor="middle"
                  className="fill-[var(--color-ink-2)] text-[22px] font-medium tracking-wide uppercase" aria-hidden>{p.name}</text>
              </g>
            ))}
            {points.map((p) => {
              const on = selectedId === p.id || hover === p.id;
              const hollow = p.state === "missing" || p.state === "blank";
              return (
                <g key={p.id} transform={`translate(${p.x} ${p.y})`} tabIndex={0} role={onSelect ? "button" : "img"}
                  aria-label={`${p.label}: ${STATE_TEXT[p.state]}${p.detail ? `. ${p.detail}` : ""}`} aria-pressed={onSelect ? selectedId === p.id : undefined}
                  className={cn("outline-none", onSelect && "cursor-pointer")}
                  onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p.id)} onBlur={() => setHover(null)}
                  onClick={() => onSelect?.(p.id)} onKeyDown={(e) => { if (onSelect && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(p.id); } }}>
                  <circle r="22" fill="transparent" />
                  {on && <circle r="17" fill="none" stroke="var(--color-teal-800)" strokeWidth="3" />}
                  <circle r={p.state === "hub" ? 11 : 9} fill={FILL[p.state]} stroke={hollow ? "var(--color-chart-missing)" : "#FFFFFF"}
                    strokeWidth={hollow ? 3 : 2} strokeDasharray={p.state === "blank" ? "3 2" : undefined} />
                </g>
              );
            })}
          </svg>
          {tip && (
            <div role="status" className="pointer-events-none absolute top-2 left-2 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs shadow-sm">
              <span className="font-semibold">{tip.label}</span> · {STATE_TEXT[tip.state]}{tip.detail ? <><br />{tip.detail}</> : null}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
