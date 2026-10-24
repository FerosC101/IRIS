import { fmtNum, fmtPct } from "@/lib/format";

/** A small probability, readable: "< 0.01%" rather than 1.2e-06. */
export function fmtChance(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  if (p < 0.0001) return "< 0.01%";
  return fmtPct(p, p < 0.01 ? 2 : p < 0.1 ? 1 : 0);
}

/** Metric cells from the pipeline: numbers, [estimate, low, high] intervals or text. */
export function fmtMetric(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) {
    const [m, lo, hi] = v as (number | null)[];
    return lo === null || lo === undefined || hi === null || hi === undefined ? fmtMetric(m) : `${fmtMetric(m)} (${fmtMetric(lo)}–${fmtMetric(hi)})`;
  }
  if (typeof v === "number") return Number.isInteger(v) ? fmtNum(v) : Math.abs(v) < 1 ? v.toFixed(3) : fmtNum(v, 2);
  return String(v);
}
