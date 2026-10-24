import type { ReactNode } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, Area, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DataTableToggle, SimpleTable } from "@/components/data-display/charts";
import { useSession } from "@/hooks/useSession";
import { fmtNum, fmtPct, fmtShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConcernDetail, TimelineRow } from "@/types/api";

/**
 * Observed weekly rows from the backend timeline, summed over the concern's units and split into
 * the weeks before the flag, the flagged weeks, and any weeks after. Only sums; no new estimates.
 */
interface Week { week: number; start: string; phase: "before" | "flagged" | "after"; expected: number; on_time: number; late: number; not_received: number; incomplete: number; cases: number; count_expected: number | null; band: [number, number] | null }
interface Totals { weeks: number; expected: number; on_time: number; late: number; not_received: number; incomplete: number; cases: number }

function weeksOf(d: ConcernDetail): Week[] {
  const rows = Object.values(d.timeline.units).flat();
  const flagged = rows.filter((r) => r.in_concern).map((r) => r.week);
  const first = Math.min(...flagged);
  const last = Math.max(...flagged);
  return d.timeline.weeks.flatMap((w) => {
    const rs = rows.filter((r) => r.week === w.week);
    if (!rs.length) return [];
    const sum = (k: keyof TimelineRow) => rs.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    const exp = rs.every((r) => r.count_expected !== null) ? sum("count_expected") : null;
    const band = rs.length === 1 && rs[0].count_band ? rs[0].count_band : null;
    return [{
      week: w.week, start: w.start, phase: w.week < first ? "before" : w.week > last ? "after" : "flagged",
      expected: sum("expected"), on_time: sum("on_time"), late: sum("late"), not_received: sum("not_received"), incomplete: sum("incomplete"),
      cases: sum("cases"), count_expected: exp, band,
    } as Week];
  });
}

function totals(ws: Week[]): Totals {
  const t: Totals = { weeks: ws.length, expected: 0, on_time: 0, late: 0, not_received: 0, incomplete: 0, cases: 0 };
  for (const w of ws) { t.expected += w.expected; t.on_time += w.on_time; t.late += w.late; t.not_received += w.not_received; t.incomplete += w.incomplete; t.cases += w.cases; }
  return t;
}

const share = (n: number, of: number) => (of ? n / of : null);

/** "▼ 100 pts" style change between two shares, coloured by whether it is worse. */
function Delta({ now, before, higherIsWorse = false }: { now: number | null; before: number | null; higherIsWorse?: boolean }) {
  if (now === null || before === null) return null;
  const d = Math.round((now - before) * 100);
  if (d === 0) return <span className="text-ink-2">no change</span>;
  const worse = higherIsWorse ? d > 0 : d < 0;
  return <span className={cn("font-semibold whitespace-nowrap", worse ? "text-critical-ink" : "text-positive-ink")}>{d > 0 ? "▲" : "▼"} {Math.abs(d)} pts</span>;
}

function Metric({ label, value, detail, compare, tone }: { label: string; value: ReactNode; detail?: ReactNode; compare?: ReactNode; tone?: "critical" | "attention" }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-line bg-white px-4 py-3.5">
      <dt className="text-[13px] font-medium text-ink-2">{label}</dt>
      <dd className={cn("mt-1 text-[28px] leading-none font-semibold tracking-tight tabular", tone === "critical" ? "text-critical-ink" : tone === "attention" ? "text-attention-ink" : "text-ink")}>{value}</dd>
      {detail && <dd className="mt-1.5 text-xs text-ink-2">{detail}</dd>}
      {compare && <dd className="mt-3 border-t border-line pt-2 text-xs leading-snug text-ink-2">{compare}</dd>}
    </div>
  );
}

const weeksLabel = (n: number) => `${n} week${n === 1 ? "" : "s"}`;

/** Headline numbers for the flagged weeks, each compared with the weeks just before. */
export function ComparisonTiles({ detail }: { detail: ConcernDetail }) {
  const { categoryName, unitName } = useSession();
  const c = detail.concern;
  const ws = weeksOf(detail);
  if (!ws.length) return null;
  const now = totals(ws.filter((w) => w.phase === "flagged"));
  const was = totals(ws.filter((w) => w.phase === "before"));
  const hasBefore = was.weeks > 0;
  const beforeLine = (text: ReactNode, delta?: ReactNode) => hasBefore
    ? <>Before ({weeksLabel(was.weeks)}): <span className="font-medium text-ink">{text}</span>{delta && <> · {delta}</>}</>
    : "No earlier weeks to compare with.";
  const onTimeNow = share(now.on_time, now.expected);
  const onTimeWas = share(was.on_time, was.expected);

  // A fourth number that fits the kind of concern; each comes from the backend's own evidence or timeline.
  let fourth: ReactNode = null;
  const ev = (key: string) => detail.evidence.find((e) => e.kind === "observed" && key in e.data)?.data;
  if (c.concern_type === "count_drop") {
    const e = ev("observed") as { observed: number; expected: number } | undefined;
    if (e) {
      const fewer = e.expected - e.observed;
      fourth = <Metric label="Cases reported" value={fmtNum(e.observed)} tone="critical"
        detail={<>About {fmtNum(e.expected, 0)} expected from recent weeks (estimate)</>}
        compare={<>About <span className="font-medium text-ink">{fmtNum(fewer, 0)} fewer</span> than expected · <span className="font-semibold whitespace-nowrap text-critical-ink">▼ {Math.round((fewer / e.expected) * 100)}%</span></>} />;
    }
  } else if (c.concern_type === "zero_case_run") {
    const e = ev("run_length") as { category: string; run_length: number; baseline_mean: number; baseline_weeks: number } | undefined;
    if (e) fourth = <Metric label={`${categoryName(e.category)} cases a week`} value="0" tone="critical" detail={`${e.run_length} weeks in a row, on reports that were received`}
      compare={<>Usually <span className="font-medium text-ink">{fmtNum(e.baseline_mean, Number.isInteger(e.baseline_mean * 10) ? 1 : 2)} a week</span> (previous {e.baseline_weeks} weeks)</>} />;
  } else if (c.concern_type === "incomplete_record") {
    const rec = now.on_time + now.late;
    fourth = <Metric label="Received with blank fields" value={fmtNum(now.incomplete)} tone={now.incomplete ? "attention" : undefined} detail={`of ${fmtNum(rec)} reports received`}
      compare={beforeLine(`${fmtNum(was.incomplete)} of ${fmtNum(was.on_time + was.late)}`, <Delta now={share(now.incomplete, rec)} before={share(was.incomplete, was.on_time + was.late)} higherIsWorse />)} />;
  } else {
    const flaggedRows = Object.values(detail.timeline.units).flat().filter((r) => r.in_concern);
    const inConcern = new Set(c.units.map((u) => u.id));
    const others = [...new Set(flaggedRows.flatMap((r) => r.peer_affected))].filter((u) => !inConcern.has(u));
    fourth = <Metric label="Connected units also delayed" value={others.length ? fmtNum(others.length) : "None"}
      detail={c.units.length > 1 ? `besides the ${c.units.length} units in this concern` : "in the same weeks"}
      compare={others.length ? others.length > 3 ? `${others.length} units, see Week by week` : others.map(unitName).join(", ") : "The delay was not seen at connected units."} />;
  }

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric label="Reports on time" value={fmtPct(onTimeNow)} tone={onTimeNow !== null && onTimeNow < 0.5 ? "critical" : undefined}
        detail={`${fmtNum(now.on_time)} of ${fmtNum(now.expected)} expected · ${weeksLabel(now.weeks)} flagged`}
        compare={beforeLine(fmtPct(onTimeWas), <Delta now={onTimeNow} before={onTimeWas} />)} />
      <Metric label="Not received" value={fmtNum(now.not_received)} tone={now.not_received ? "critical" : undefined} detail={`of ${fmtNum(now.expected)} expected reports`}
        compare={beforeLine(`${fmtNum(was.not_received)} of ${fmtNum(was.expected)}`)} />
      <Metric label="Late" value={fmtNum(now.late)} tone={now.late ? "attention" : undefined} detail="arrived after the due date"
        compare={beforeLine(`${fmtNum(was.late)} of ${fmtNum(was.expected)}`)} />
      {fourth}
    </dl>
  );
}

const C = { on_time: "#1A9EA0", complete: "#1A9EA0", late: "#C98A1A", incomplete: "#C98A1A", not_received: "#B65F59", cases: "#0E6680", count_expected: "#7893A8" };
const AXIS = { fontSize: 12, fill: "var(--iris-chart-axis)" };
const GRID = "var(--iris-chart-grid)";

function Swatch({ color, line }: { color: string; line?: boolean }) {
  return line
    ? <svg width="18" height="8" aria-hidden><line x1="1" y1="4" x2="17" y2="4" stroke={color} strokeWidth="2" strokeDasharray="4 3" /></svg>
    : <span className="size-2.5 rounded-[2px]" style={{ background: color }} aria-hidden />;
}

/**
 * Week-by-week bars with the flagged weeks shaded. Count drops show reported cases against the
 * expected level (estimate); everything else shows how the expected reports arrived.
 */
export function ConcernWeekChart({ detail }: { detail: ConcernDetail }) {
  const ws = weeksOf(detail);
  if (!ws.length) return <p className="text-sm text-ink-2">No weekly data was stored for this concern.</p>;
  const counts = detail.concern.concern_type === "count_drop";
  const incomplete = detail.concern.concern_type === "incomplete_record";
  const flagged = ws.filter((w) => w.phase === "flagged");
  const data = ws.map((w) => ({ ...w, complete: w.on_time + w.late - w.incomplete, bandRange: w.band }));
  const series = counts
    ? [{ key: "cases", label: "Cases reported (observed)" }, { key: "count_expected", label: "Expected from recent weeks (estimate)", line: true }]
    : incomplete
      ? [{ key: "complete", label: "Received, complete" }, { key: "incomplete", label: "Received with blank fields" }, { key: "not_received", label: "Not received" }]
      : [{ key: "on_time", label: "On time" }, { key: "late", label: "Late" }, { key: "not_received", label: "Not received" }];
  const title = counts ? "Cases reported each week compared with the expected level" : "How the expected reports arrived each week";
  const stackTop = series.length - 1;
  return (
    <figure aria-label={title} className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
        {series.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><Swatch color={C[s.key as keyof typeof C]} line={"line" in s} />{s.label}</span>)}
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[2px] bg-[var(--iris-chart-2)] opacity-20" aria-hidden />Flagged weeks</span>
      </div>
      <div className="h-[220px] w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: 0 }} barCategoryGap="18%">
            <CartesianGrid stroke={GRID} vertical={false} />
            {flagged.length > 0 && <ReferenceArea x1={flagged[0].start} x2={flagged[flagged.length - 1].start} fill="var(--iris-chart-2)" fillOpacity={0.14} ifOverflow="extendDomain"
              label={{ value: "Flagged", position: "insideTop", offset: -14, fontSize: 11, fill: "var(--iris-chart-axis)" }} />}
            <XAxis dataKey="start" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(v: string) => fmtShortDate(v)} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
            <Tooltip cursor={{ fill: "var(--iris-chart-grid)" }} content={({ active, payload }) => {
              const w = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !w) return null;
              return (
                <div className="rounded-md border border-line bg-white px-3 py-2 text-xs shadow-md">
                  <p className="mb-1 font-semibold text-ink">Week of {fmtShortDate(w.start)}{w.phase === "flagged" ? " · flagged" : ""}</p>
                  {counts
                    ? <p>{fmtNum(w.cases)} cases reported{w.count_expected !== null ? `, about ${fmtNum(w.count_expected, 0)} expected` : ""}</p>
                    : <p>{incomplete ? `${w.complete} complete, ${w.incomplete} with blanks` : `${w.on_time} on time, ${w.late} late`}, {w.not_received} not received, of {w.expected}</p>}
                </div>
              );
            }} />
            {counts ? <>
              {data.some((w) => w.bandRange) && <Area dataKey="bandRange" stroke="none" fill={C.count_expected} fillOpacity={0.12} isAnimationActive={false} />}
              <Bar dataKey="cases" fill={C.cases} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Line dataKey="count_expected" stroke={C.count_expected} strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false} />
            </> : series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} stackId="r" fill={C[s.key as keyof typeof C]} isAnimationActive={false} radius={i === stackTop ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{title}. A data table is available below the chart.</figcaption>
      <DataTableToggle>
        <SimpleTable head={["Week of", "Flagged", ...series.map((s) => s.label)]}
          rows={data.map((w) => [fmtShortDate(w.start), w.phase === "flagged" ? "Yes" : "No", ...series.map((s) => {
            const v = w[s.key as keyof typeof w] as number | null;
            return v === null ? "—" : fmtNum(v, s.key === "count_expected" ? 0 : undefined);
          })])} />
      </DataTableToggle>
    </figure>
  );
}
