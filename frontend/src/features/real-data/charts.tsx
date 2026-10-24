import { ChevronLeft, ChevronRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DataTableToggle, SERIES, SimpleTable, TipBox, type SeriesDef } from "@/components/data-display/charts";
import { Button } from "@/components/ui/button";
import { fmtShortDate } from "@/lib/format";

const AXIS = { fontSize: 12, fill: "var(--iris-chart-axis)" };

/** Legend for bar charts: a filled swatch per series (none for a single series; the title names it). */
function Legend({ series }: { series: SeriesDef[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: SERIES[i].color }} aria-hidden />{s.label}</li>
      ))}
    </ul>
  );
}
const GRID = "var(--iris-chart-grid)";

/**
 * Weekly bars, one or two stacked series. Clicking a bar picks that week; the picked
 * week is shaded. The week stepper beside the chart does the same from the keyboard.
 */
export function WeekBars({ data: rawData, series, selected, onSelect, title, height = 200, fmt = (v) => String(v) }: {
  data: object[]; series: SeriesDef[]; selected?: string | null; onSelect?: (week: string) => void; title: string; height?: number;
  fmt?: (v: number) => string;
}) {
  const data = rawData as Record<string, unknown>[];
  const top = series.length - 1;
  return (
    <figure aria-label={title} className="min-w-0">
      {series.length > 1 && <div className="mb-2"><Legend series={series} /></div>}
      <div style={{ height }} className="w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="12%"
            onClick={(e) => { const w = (e as { activeLabel?: string } | null)?.activeLabel; if (w && onSelect) onSelect(String(w)); }}
            style={onSelect ? { cursor: "pointer" } : undefined}>
            <CartesianGrid stroke={GRID} vertical={false} />
            {selected && <ReferenceArea x1={selected} x2={selected} fill="var(--iris-chart-axis)" fillOpacity={0.14} ifOverflow="extendDomain" />}
            <XAxis dataKey="week_start" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(v: string) => fmtShortDate(v)} minTickGap={24} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
            <Tooltip cursor={{ fill: "var(--iris-chart-grid)" }}
              content={({ active, payload, label }) => (active && payload?.length ? (
                <TipBox title={`Week of ${fmtShortDate(String(label))}`} rows={series.map((s, i) => ({ label: s.label, value: fmt(Number(payload.find((p) => p.dataKey === s.key)?.value ?? 0)), i }))} />
              ) : null)} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} stackId="w" fill={SERIES[i].color} isAnimationActive={false}
                radius={i === top ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{title}. A data table is available below the chart.</figcaption>
      <DataTableToggle>
        <SimpleTable head={["Week of", ...series.map((s) => s.label)]} rows={data.map((d) => [String(d.week_start), ...series.map((s) => fmt(Number(d[s.key] ?? 0)))])} />
      </DataTableToggle>
    </figure>
  );
}

/** Previous / next week, with the week named in between. */
export function WeekStepper({ weeks, value, onChange, label }: { weeks: string[]; value: string; onChange: (w: string) => void; label: (w: string) => string }) {
  const i = weeks.indexOf(value);
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Choose week">
      <Button variant="ghost" size="icon" aria-label="Previous week" disabled={i <= 0} onClick={() => onChange(weeks[i - 1])}><ChevronLeft aria-hidden /></Button>
      <p className="min-w-0 flex-1 text-center text-sm font-semibold sm:flex-none" aria-live="polite">{label(value)}</p>
      <Button variant="ghost" size="icon" aria-label="Next week" disabled={i < 0 || i >= weeks.length - 1} onClick={() => onChange(weeks[i + 1])}><ChevronRight aria-hidden /></Button>
    </div>
  );
}

/**
 * Horizontal bars as plain HTML rows: the label sits above its bars, so long method
 * names never squeeze the plot on a phone. One or two series; values are printed.
 */
export function BarRows({ rows, series, fmt, max = 1, caption }: {
  rows: { label: string; values: (number | null)[]; strong?: boolean }[]; series: SeriesDef[]; fmt: (v: number) => string; max?: number; caption: string;
}) {
  return (
    <figure aria-label={caption} className="min-w-0">
      {series.length > 1 && <div className="mb-3"><Legend series={series} /></div>}
      <ul className="flex flex-col gap-3" aria-hidden>
        {rows.map((r) => (
          <li key={r.label}>
            <p className={r.strong ? "text-[13px] font-semibold text-ink" : "text-[13px] text-ink"}>{r.label}</p>
            {r.values.map((v, i) => (
              <div key={i} className="mt-1 flex items-center gap-2" title={`${series[i].label}: ${v == null ? "—" : fmt(v)}`}>
                <div className="h-2.5 flex-1 rounded-sm bg-aqua-50">
                  {v != null && <div className="h-2.5 rounded-sm" style={{ width: `${Math.max(0.5, Math.min(1, v / max) * 100)}%`, background: SERIES[i].color }} />}
                </div>
                <span className="w-12 text-right text-xs text-ink tabular">{v == null ? "—" : fmt(v)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">{caption}. A data table is available below.</figcaption>
      <DataTableToggle>
        <SimpleTable head={["Method", ...series.map((s) => s.label)]} rows={rows.map((r) => [r.label, ...r.values.map((v) => (v == null ? "—" : fmt(v)))])} />
      </DataTableToggle>
    </figure>
  );
}

/** Reported count against the model's expected value and 90% range, on one scale. */
export function RangeMarker({ reported, expected, low, high }: { reported: number; expected: number; low: number; high: number }) {
  const max = Math.max(high, expected, reported, 1) * 1.1;
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <figure aria-label={`Reported ${reported}; expected about ${expected.toFixed(1)}, 90% range ${low} to ${high}`}>
      <div className="relative h-8" aria-hidden>
        <div className="absolute inset-x-0 top-3.5 h-1 rounded-full bg-aqua-50" />
        <div className="absolute top-2.5 h-3 rounded-sm" style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})`, background: "var(--iris-chart-2)", opacity: 0.45 }} />
        <div className="absolute top-1.5 h-5 w-0.5 bg-teal-900" style={{ left: pct(expected) }} />
        <div className="absolute top-2 size-4 -translate-x-1/2 rounded-full border-2 border-white" style={{ left: pct(reported), background: "var(--color-critical)" }} />
      </div>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: "var(--color-critical)" }} aria-hidden />Reported {reported}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-teal-900" aria-hidden />Expected about {expected.toFixed(1)}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={{ background: "var(--iris-chart-2)", opacity: 0.45 }} aria-hidden />Normal range {low}–{high}</span>
      </figcaption>
    </figure>
  );
}

/** A short row of headline numbers. */
export function StatStrip({ items }: { items: { label: string; value: string | number; note?: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2 sm:gap-3">
      {items.map((s) => (
        <div key={s.label} className="min-w-0 rounded-md border border-line bg-white px-3 py-2.5 sm:px-4 sm:py-3">
          <dt className="text-xs font-medium text-ink-2">{s.label}</dt>
          <dd className="mt-1 text-lg font-semibold text-ink tabular sm:text-2xl">{s.value}</dd>
          {s.note && <dd className="mt-0.5 hidden text-xs text-ink-2 sm:block">{s.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
