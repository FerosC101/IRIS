import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ConcernStatusBadge, SimulatedTag } from "@/components/data-display/badges";
import { TrendChart } from "@/components/data-display/charts";
import { Badge } from "@/components/ui/badge";
import { KeyValue } from "@/components/ui/panel";
import { ErrorState, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { fmtPct, fmtPeriod } from "@/lib/format";
import { UNIT_TYPE } from "@/lib/labels";
import { api } from "@/services/api";
import type { NetworkNode } from "@/types/api";

const REL_LABEL = { reports_through: "Reports through", specimen_referral: "Sends specimens to", shared_resource: "Shares resources with" } as const;
const REL_IN = { reports_through: "Receives reports from", specimen_referral: "Receives specimens from", shared_resource: "Shares resources with" } as const;

export function NodeDetails({ node }: { node: NetworkNode }) {
  const { categoryName } = useSession();
  const q = useQuery({ queryKey: ["unit", node.id], queryFn: () => api.unit(node.id) });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{node.name}</h2>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge tone="teal">{UNIT_TYPE[node.unit_type]}</Badge>
          <Badge tone={node.status === "missing" ? "critical" : node.status === "delayed" ? "attention" : "positive"}>{node.status_label}</Badge>
          {node.is_sentinel && <Badge>Sentinel site</Badge>}
          <SimulatedTag />
        </div>
      </div>
      <KeyValue items={[
        { label: "Province", value: node.province },
        { label: "Municipality", value: node.municipality ?? "—" },
        { label: "Completeness (window)", value: fmtPct(node.completeness) },
        { label: "Timeliness (window)", value: fmtPct(node.timeliness) },
        ...(node.downstream_units !== null ? [{ label: "Units reporting through it", value: String(node.downstream_units) }] : []),
        { label: "Open concerns", value: String(node.open_concerns) },
      ]} />
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data ? <Loading label="Loading unit details" /> : (
        <>
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-ink">Relationships (simulated)</h3>
            {q.data.relationships.length === 0 ? <p className="text-sm text-ink-2">No relationships defined.</p> : (
              <ul className="flex flex-col gap-1 text-sm">
                {q.data.relationships.map((r) => (
                  <li key={r.id}><span className="text-ink-2">{r.direction === "outgoing" ? REL_LABEL[r.relationship_type] : REL_IN[r.relationship_type]}</span> {r.other_name}</li>
                ))}
              </ul>
            )}
          </div>
          {q.data.expectations.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-ink">Reporting schedule</h3>
              <p className="text-sm text-ink">{q.data.expectations.map((e) => `${categoryName(e.category_code)} (${e.frequency})`).join(", ")}</p>
            </div>
          )}
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-ink">Reporting history</h3>
            {q.data.history_note && <p className="mb-1 text-xs text-ink-2">{q.data.history_note}</p>}
            <TrendChart title={`Weekly reporting for ${node.name}`} data={q.data.history} xKey="period_start" height={170}
              series={[{ key: "completeness", label: "Completeness" }, { key: "timeliness", label: "Timeliness" }]} />
          </div>
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-ink">Concerns involving this unit</h3>
            {q.data.concerns.length === 0 ? <p className="text-sm text-ink-2">None.</p> : (
              <ul className="flex flex-col gap-2">
                {q.data.concerns.slice(0, 8).map((c) => (
                  <li key={c.id} className="text-sm">
                    <Link to={`/investigations/${c.id}`} className="font-medium text-teal-900 hover:underline">{c.title}</Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-2"><ConcernStatusBadge status={c.status} /> {fmtPeriod(c.period_start, c.period_end)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
