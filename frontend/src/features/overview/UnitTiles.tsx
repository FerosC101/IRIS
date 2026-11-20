import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ErrorState, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { NetworkNode } from "@/types/api";

/** A short tile label; the full name is in the tooltip and for screen readers. */
function tileLabel(n: NetworkNode): string {
  if (n.unit_type === "rhu") return n.name.replace(/ RHU\b/, "");
  if (n.unit_type === "laboratory") return /reference/i.test(n.name) ? "Ref. lab" : "Lab";
  if (/regional/i.test(n.name)) return "Med. center";
  if (/district/i.test(n.name)) return "District hosp.";
  return "Hospital";
}

const TONE: Record<NetworkNode["status"], string> = {
  normal: "bg-teal-600 text-white",
  delayed: "bg-attention-bg text-attention-ink ring-[1.5px] ring-inset ring-attention",
  missing: "bg-critical-bg text-critical-ink ring-[1.5px] ring-inset ring-critical",
  no_schedule: "bg-tint text-ink-2",
};

/** Every reporting unit for the latest week as a tile, grouped by province: the week at a glance. */
export function UnitTiles() {
  const { meta } = useSession();
  const last = meta?.weeks.at(-1)?.week;
  const q = useQuery({ queryKey: ["network", last, last], queryFn: () => api.network({ w_from: last, w_to: last }), enabled: last !== undefined });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loading label="Loading units" />;
  const units = q.data.nodes.filter((n) => n.unit_type !== "hub");
  const provinces = [...new Set(units.map((n) => n.province))].sort();
  const missing = units.filter((n) => n.status === "missing").length;
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {provinces.map((p) => (
          <div key={p} className="min-w-0">
            <p className="mb-1.5 text-[10.5px] font-semibold tracking-wider text-ink-2 uppercase">{p}</p>
            <ul className="grid grid-cols-1 gap-1">
              {units.filter((n) => n.province === p).map((n) => (
                <li key={n.id}>
                  <Link to={`/network?unit=${n.id}`} title={`${n.name}: ${n.status_label}`} aria-label={`${n.name}: ${n.status_label}`}
                    className={cn("block truncate rounded-[5px] px-2 py-1 text-[12px] font-medium hover:opacity-85", TONE[n.status])}>
                    {tileLabel(n)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-teal-600" aria-hidden />All reports in</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-critical-bg ring-1 ring-critical" aria-hidden />Reports missing</span>
        <span className="ml-auto font-medium text-ink tabular">{missing} of {units.length} missing</span>
      </div>
    </div>
  );
}
