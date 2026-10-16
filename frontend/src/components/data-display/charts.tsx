import { useId, useState, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, ReferenceArea } from "recharts";
import { fmtPct, fmtShortDate } from "@/lib/format";

/**
 * Chart conventions:
 * - at most two series per chart: soft teal solid and bright teal dashed;
 *   surface-aware variables and dashes preserve identity beyond color
 * - one y-axis; recessive grid; 2px lines; legend always shown for 2 series
 * - every chart has a "Show data table" alternative
 */
export const SERIES = [
  { color: "var(--iris-chart-1)", dash: undefined },
  { color: "var(--iris-chart-2)", dash: "6 4" },
] as const;
const AXIS = { fontSize: 12, fill: "var(--iris-chart-axis)" };
const GRID = "var(--iris-chart-grid)";

export interface SeriesDef { key: string; label: string }

export function Legend({ series }: { series: SeriesDef[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke={SERIES[i].color} strokeWidth="2" strokeDasharray={SERIES[i].dash} /></svg>
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function TipBox({ title, rows }: { title: string; rows: { label: string; value: string; i: number }[] }) {
  return (
    <div className="rounded-md border border-line bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-ink-2">
          <svg width="14" height="6" aria-hidden><line x1="0" y1="3" x2="14" y2="3" stroke={SERIES[r.i]?.color ?? "var(--iris-chart-axis)"} strokeWidth="2" strokeDasharray={SERIES[r.i]?.dash} /></svg>
          <span>{r.label}</span>
          <span className="ml-auto pl-3 font-medium text-ink tabular">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function DataTableToggle({ children, label = "Show data table" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mt-2">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="min-h-11 text-xs font-medium text-teal-900 underline-offset-2 hover:underline sm:min-h-0">
        {open ? "Hide data table" : label}
      </button>
      {open && <div id={id} className="mt-2 max-h-72 overflow-auto rounded-sm border border-line">{children}</div>}
    </div>
  );
}

export function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className={`w-full text-xs ${head.length >= 4 ? "min-w-[34rem]" : ""}`}>
      <thead className="sticky top-0 bg-porcelain">
        <tr>{head.map((h) => <th key={h} scope="col" className="px-2 py-1.5 text-left font-semibold text-ink-2">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="px-2 py-1 tabular">{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

/** Line chart for up to two series over time. */
export function TrendChart({
  data: rawData, xKey, series, height = 220, percent = true, title, highlight, yMax,
}: {
  data: object[]; xKey: string; series: SeriesDef[]; height?: number; percent?: boolean; title: string;
  highlight?: { from: string; to: string; label: string }; yMax?: number;
}) {
  const fmt = (v: unknown) => (typeof v === "number" ? (percent ? fmtPct(v) : v.toLocaleString()) : "—");
  const data = rawData as Record<string, unknown>[];
  return (
    <figure aria-label={title} className="min-w-0">
      <div className="mb-2"><Legend series={series} /></div>
      <div style={{ height }} className="w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            {highlight && <ReferenceArea x1={highlight.from} x2={highlight.to} fill="var(--iris-chart-2)" fillOpacity={0.10} ifOverflow="extendDomain" label={{ value: highlight.label, position: "insideTopLeft", fontSize: 11, fill: "var(--iris-chart-axis)" }} />}
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(v: string) => fmtShortDate(v)} minTickGap={18} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={percent ? [0, 1] : [0, yMax ?? "auto"]} tickFormatter={(v: number) => (percent ? `${Math.round(v * 100)}%` : String(v))} width={44} />
            <Tooltip
              cursor={{ stroke: "var(--iris-chart-axis)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TipBox title={`Week of ${fmtShortDate(String(label))}`} rows={series.map((s, i) => ({ label: s.label, value: fmt(payload.find((p) => p.dataKey === s.key)?.value), i }))} />
                ) : null
              }
            />
            {series.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[i].color} strokeWidth={2} strokeDasharray={SERIES[i].dash}
                dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{title}. A data table is available below the chart.</figcaption>
      <DataTableToggle>
        <SimpleTable head={["Period", ...series.map((s) => s.label)]} rows={data.map((d) => [String(d[xKey]), ...series.map((s) => fmt(d[s.key]))])} />
      </DataTableToggle>
    </figure>
  );
}

/** Small single-series sparkline-style trend used in the overview. */
export function MiniTrend({ data, xKey, yKey, label }: { data: object[]; xKey: string; yKey: string; label: string }) {
  return (
    <div style={{ height: 64 }} className="w-full" aria-hidden title={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <YAxis hide domain={[0, 1]} />
          <XAxis dataKey={xKey} hide />
          <Tooltip content={({ active, payload, label: l }) => (active && payload?.length ? <TipBox title={`Week of ${fmtShortDate(String(l))}`} rows={[{ label, value: fmtPct(payload[0].value as number), i: 0 }]} /> : null)} />
          <Line type="monotone" dataKey={yKey} stroke={SERIES[0].color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Vertical bars for a single count series (e.g., concerns opened per week). */
export function CountBars({ data: rawData, xKey, yKey, label, height = 180 }: { data: object[]; xKey: string; yKey: string; label: string; height?: number }) {
  const data = rawData as Record<string, unknown>[];
  return (
    <figure aria-label={label}>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barCategoryGap={2}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(v: string) => fmtShortDate(v)} minTickGap={18} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
            <Tooltip cursor={{ fill: "var(--iris-chart-grid)" }} content={({ active, payload, label: l }) => (active && payload?.length ? <TipBox title={`Week of ${fmtShortDate(String(l))}`} rows={[{ label, value: String(payload[0].value), i: 0 }]} /> : null)} />
            <Bar dataKey={yKey} fill={SERIES[0].color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTableToggle>
        <SimpleTable head={["Week of", label]} rows={data.map((d) => [String(d[xKey]), String(d[yKey] ?? "—")])} />
      </DataTableToggle>
    </figure>
  );
}

/** Horizontal proportion bar with the value as text (identity comes from the row label). */
export function ProportionBar({ value, label, ci }: { value: number | null; label?: string; ci?: [number, number] | null }) {
  if (value === null) return <span className="text-ink-2">—</span>;
  return (
    <div className="flex min-w-[6rem] items-center gap-2">
      <div className="relative h-2 flex-1 rounded-sm bg-aqua-50" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-sm bg-teal-600" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
        {ci && <div className="absolute -top-0.5 h-3 border-x border-teal-900" style={{ left: `${ci[0] * 100}%`, width: `${(ci[1] - ci[0]) * 100}%` }} />}
      </div>
      <span className="w-12 text-right text-[13px] font-medium tabular">{fmtPct(value)}</span>
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}
