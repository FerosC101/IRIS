/** Formatting helpers. Dates are displayed in the simulated local time (PHT). */

export type DateStyle = "readable" | "iso";
let dateStyle: DateStyle = "readable";
export function setDateStyle(s: DateStyle) {
  dateStyle = s;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(value: string) {
  const [d, t] = value.split("T");
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day, t };
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const { y, m, day } = parts(value);
  if (dateStyle === "iso") return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return `${MONTHS[m - 1]} ${day}, ${y}`;
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const { t } = parts(value);
  const time = t ? t.slice(0, 5) : "";
  return time ? `${fmtDate(value)} ${time}` : fmtDate(value);
}

export function fmtPeriod(start: string, end?: string | null): string {
  if (!end || end === start) return fmtDate(start);
  const a = parts(start);
  const b = parts(end);
  if (dateStyle === "iso") return `${fmtDate(start)} – ${fmtDate(end)}`;
  if (a.y === b.y && a.m === b.m) return `${MONTHS[a.m - 1]} ${a.day}–${b.day}, ${a.y}`;
  if (a.y === b.y) return `${MONTHS[a.m - 1]} ${a.day} – ${MONTHS[b.m - 1]} ${b.day}, ${a.y}`;
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

export function fmtShortDate(value: string): string {
  const { m, day } = parts(value);
  return dateStyle === "iso" ? `${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}` : `${MONTHS[m - 1]} ${day}`;
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtSigned(v: number | null | undefined, asPct = true): string {
  if (v === null || v === undefined) return "—";
  const s = asPct ? `${(Math.abs(v) * 100).toFixed(1)} pts` : Math.abs(v).toFixed(2);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : `±${s}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
}
