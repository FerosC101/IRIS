import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ConcernStatusBadge, SimulatedTag } from "@/components/data-display/badges";
import { TrendChart } from "@/components/data-display/charts";
import { Badge } from "@/components/ui/badge";
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
  // Clear levels: the unit's name, then its numbers, then sections under small eyebrow headings.
  const stats = [
    { label: "Completeness", value: fmtPct(node.completeness) },
    { label: "Timeliness", value: fmtPct(node.timeliness) },
    node.downstream_units !== null
      ? { label: "Units reporting through it", value: String(node.downstream_units) }
      : { label: "Open concerns", value: String(node.open_concerns) },
  ];
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-xl leading-tight font-semibold text-ink">{node.name}</h2>
        <p className="mt-1 text-[13px] text-ink-2">{[node.municipality, node.province && `${node.province} province`].filter(Boolean).join(" · ")}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Badge tone="teal">{UNIT_TYPE[node.unit_type]}</Badge>
          <Badge tone={node.status === "missing" ? "critical" : node.status === "delayed" ? "attention" : "positive"}>{node.status_label}</Badge>
          {node.is_sentinel && <Badge>Sentinel site</Badge>}
          {node.simulated && <SimulatedTag />}
        </div>
      </header>
      <dl className="grid grid-cols-3 gap-2">
        {stats.map((x) => (
          <div key={x.label} className="min-w-0 rounded-md border border-line bg-white px-2.5 py-2">
            <dt className="text-[11px] leading-tight text-ink-2">{x.label}</dt>
            <dd className="mt-1 text-lg leading-tight font-semibold text-ink tabular">{x.value}</dd>
          </div>
        ))}
      </dl>
      <p className="-mt-3 text-xs text-ink-2">Completeness and timeliness for the selected weeks{node.downstream_units !== null ? `; ${node.open_concerns} open concern${node.open_concerns === 1 ? "" : "s"} involve this hub` : ""}.</p>
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data ? <Loading label="Loading unit details" /> : (
        <>
          <Section title="Relationships" note="simulated">
            {q.data.relationships.length === 0 ? <p className="text-sm text-ink-2">No relationships defined.</p> : (
              <ul className="flex flex-col gap-2">
                {q.data.relationships.map((r) => (
                  <li key={r.id} className="leading-snug">
                    <span className="block text-[11.5px] text-ink-2">{r.direction === "outgoing" ? REL_LABEL[r.relationship_type] : REL_IN[r.relationship_type]}</span>
                    <Link to={`/network?unit=${r.other_id}`} className="text-sm font-medium text-info-ink hover:underline">{r.other_name}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {q.data.expectations.length > 0 && (
            <Section title="Reporting schedule">
              <ul className="flex flex-wrap gap-1.5">
                {q.data.expectations.map((e) => (
                  <li key={e.category_code} className="rounded-sm border border-line bg-white px-2 py-0.5 text-xs text-ink">{categoryName(e.category_code)} <span className="text-ink-2">· {e.frequency}</span></li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="Reporting history">
            {q.data.history_note && <p className="mb-1 text-xs text-ink-2">{q.data.history_note}</p>}
            <TrendChart title={`Weekly reporting for ${node.name}`} data={q.data.history} xKey="period_start" height={170}
              series={[{ key: "completeness", label: "Completeness" }, { key: "timeliness", label: "Timeliness" }]} />
          </Section>
          <Section title="Concerns involving this unit">
            {q.data.concerns.length === 0 ? <p className="text-sm text-ink-2">None.</p> : (
              <ul className="flex flex-col gap-2.5">
                {q.data.concerns.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <Link to={`/investigations/${c.id}`} className="text-sm font-medium text-teal-900 hover:underline">{c.title}</Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-2"><ConcernStatusBadge status={c.status} /> {fmtPeriod(c.period_start, c.period_end)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-2 uppercase">{title}{note && <span className="ml-1.5 font-normal tracking-normal normal-case">({note})</span>}</h3>
      {children}
    </section>
  );
}
