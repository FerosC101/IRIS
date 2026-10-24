import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import type { UnitType, WeekLabel } from "@/types/api";

export type UnitGroup = "" | Exclude<UnitType, "hub">;

export interface GlobalFilters {
  /** Province name, or "" for every province in scope. */
  region: string;
  /** Weekly reporting category code. */
  disease: string;
  /** Week indexes on the dataset calendar (inclusive). */
  from: number;
  to: number;
  group: UnitGroup;
}

const KEYS = ["region", "disease", "from", "to", "group"] as const;
const GROUPS: UnitGroup[] = ["", "rhu", "hospital", "laboratory"];

/**
 * Screen-wide filters (region, disease, ISO week range, unit group), kept in
 * the URL so every view is deep-linkable. Defaults come from the backend
 * metadata: the latest dataset week and the first weekly category (dengue).
 */
export function useGlobalFilters() {
  const { meta } = useSession();
  const [params, setParams] = useSearchParams();
  const weeks: WeekLabel[] = meta?.weeks ?? [];
  const weekly = useMemo(() => (meta?.categories ?? []).filter((c) => c.frequency === "weekly"), [meta]);
  const last = weeks.length ? weeks[weeks.length - 1].week : 0;
  const defaultDisease = weekly.find((c) => c.code === "DENGUE")?.code ?? weekly[0]?.code ?? "";

  const filters: GlobalFilters = useMemo(() => {
    const num = (k: string, d: number) => {
      const v = Number(params.get(k));
      return params.has(k) && Number.isInteger(v) && v >= 0 && v <= last ? v : d;
    };
    const to = num("to", last);
    const from = Math.min(num("from", to), to);
    const disease = params.get("disease") ?? "";
    const group = (params.get("group") ?? "") as UnitGroup;
    return {
      region: meta?.provinces.includes(params.get("region") ?? "") ? params.get("region")! : "",
      disease: weekly.some((c) => c.code === disease) ? disease : defaultDisease,
      from, to,
      group: GROUPS.includes(group) ? group : "",
    };
  }, [params, last, meta, weekly, defaultDisease]);

  const set = useCallback((patch: Partial<GlobalFilters>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const k of KEYS) {
        if (!(k in patch)) continue;
        const v = patch[k];
        if (v === "" || v === undefined || v === null) next.delete(k);
        else next.set(k, String(v));
      }
      return next;
    }, { replace: true });
  }, [setParams]);

  return { filters, set, weeks, categories: weekly, provinces: meta?.provinces ?? [] };
}

export function weekRangeLabel(weeks: WeekLabel[], from: number, to: number): string {
  const a = weeks.find((w) => w.week === from);
  const b = weeks.find((w) => w.week === to);
  if (!a || !b) return "Choose weeks";
  if (from === to) return b.iso_label;
  // Fixed month names, so the label never depends on the browser's locale data ("Sept" vs "Sep").
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = (iso: string) => `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
  return `ISO W${a.iso_week}–W${b.iso_week} · ${day(a.start)}–${day(b.end)}`;
}

export const UNIT_GROUP_LABELS: Record<UnitGroup, string> = {
  "": "All reporting units",
  rhu: "Rural health units",
  hospital: "Hospitals",
  laboratory: "Laboratories",
};
