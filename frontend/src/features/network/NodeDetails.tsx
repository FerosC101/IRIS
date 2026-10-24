import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ConcernStatusBadge, SimulatedTag } from "@/components/data-display/badges";
import { TrendChart } from "@/components/data-display/charts";
import { Badge } from "@/components/ui/badge";
import { ErrorState, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { fmtPct, fmtPeriod, fmtShortDate } from "@/lib/format";
import { UNIT_TYPE } from "@/lib/labels";
import { api } from "@/services/api";
import type { NetworkGraphData, NetworkNode, UnitDetail } from "@/types/api";

const REL_LABEL = { reports_through: "Sends its reports to", specimen_referral: "Sends specimens to", shared_resource: "Shares staff or equipment with" } as const;
const REL_IN = { reports_through: "Receives reports from", specimen_referral: "Receives specimens from", shared_resource: "Shares staff or equipment with" } as const;

/** Says how the unit is doing, for which weeks, and what the numbers above cover; the tiles carry the numbers. */
function statusSentence(n: NetworkNode, weeks: string, t: NetworkGraphData["status_thresholds"]): string {
  const hub = n.downstream_units !== null;
  const lead = n.status === "no_schedule" || n.completeness === null ? `No reports were due in ${weeks}.`
    : n.status === "missing" ? `Some reports are missing for ${weeks}.`
    : n.status === "delayed" ? `Some reports were late in ${weeks}.`
    : `Reporting normally in ${weeks}.`;
  const scope = hub ? ` The figures cover all ${n.downstream_units} units that report up to this hub, directly or through another hub.` : "";
  const concerns = n.open_concerns ? ` ${n.open_concerns} open concern${n.open_concerns === 1 ? " involves" : "s involve"} ${hub ? "this hub" : "it"}.` : " No open concerns.";
  // A unit just above a cutoff looks "normal" but is one bad week from changing status; say so.
  const near = n.completeness !== null && n.status !== "missing" && n.completeness - t.completeness < 0.05
    ? ` Arrivals are close to the ${fmtPct(t.completeness)} cutoff for "missing".`
    : n.timeliness !== null && n.status === "normal" && n.timeliness - t.timeliness < 0.05 ? ` On-time reports are close to the ${fmtPct(t.timeliness)} cutoff for "late".` : "";
  return lead + near + scope + concerns;
}

export function NodeDetails({ node, weeks, thresholds }: { node: NetworkNode; weeks: string; thresholds: NetworkGraphData["status_thresholds"] }) {
  const { categoryName } = useSession();
  const q = useQuery({ queryKey: ["unit", node.id], queryFn: () => api.unit(node.id) });
  // Clear levels: the unit's name, then its numbers, then sections under small eyebrow headings.
  const stats = [
    { label: "Reports arrived", value: fmtPct(node.completeness), note: `cutoff ${fmtPct(thresholds.completeness)}` },
    { label: "Arrived on time", value: fmtPct(node.timeliness), note: `cutoff ${fmtPct(thresholds.timeliness)}` },
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
            {"note" in x && <dd className="mt-0.5 text-[11px] text-ink-2">{x.note}</dd>}
          </div>
        ))}
      </dl>
      <p className="-mt-2 text-sm leading-relaxed text-ink">{statusSentence(node, weeks, thresholds)}</p>
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data ? <Loading label="Loading unit details" /> : (
        <>
          <Section title="Connections" note="simulated">
            {q.data.relationships.length === 0 ? <p className="text-sm text-ink-2">No connections defined.</p> : (
              <div className="flex flex-col gap-3">
                {groupRelationships(q.data.relationships).map(([label, rs]) => (
                  <div key={label}>
                    <p className="text-[13px] text-ink-2">{label} <span className="tabular">({rs.length})</span></p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {rs.map((r) => (
                        <li key={r.id}>
                          <Link to={`/network?unit=${r.other_id}`} className="inline-flex min-h-8 items-center rounded-md border border-line bg-white px-2 text-[13px] font-medium text-info-ink hover:border-teal-800 hover:bg-aqua-50">{r.other_name}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>
          {q.data.expectations.length > 0 && (
            <Section title="Reports it must send">
              <ul className="flex flex-wrap gap-1.5">
                {q.data.expectations.map((e) => (
                  <li key={e.category_code} className="rounded-sm border border-line bg-white px-2 py-0.5 text-xs text-ink">{categoryName(e.category_code)} <span className="text-ink-2">· {e.frequency}</span></li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="Reports arriving each week">
            {q.data.history_note && node.downstream_units === null && <p className="mb-1 text-xs text-ink-2">{q.data.history_note}</p>}
            <Lowest history={q.data.history} />
            <TrendChart title={`Share of expected reports that arrived each week, ${node.name}`} data={q.data.history} xKey="period_start" height={170}
              series={[{ key: "completeness", label: "Arrived" }, { key: "timeliness", label: "On time" }]} />
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

type Rel = UnitDetail["relationships"][number];

/** The worst week for each measure, so a dip that looks small on a 0–100% chart is still read. */
function Lowest({ history }: { history: UnitDetail["history"] }) {
  const low = (k: "completeness" | "timeliness") => history.filter((h) => h[k] !== null).reduce<UnitDetail["history"][number] | null>((m, h) => (!m || h[k]! < m[k]! ? h : m), null);
  const a = low("completeness");
  const t = low("timeliness");
  if (!a || !t) return null;
  return (
    <p className="mb-2 text-xs text-ink-2">
      Lowest week: <span className="font-medium text-ink">{fmtPct(a.completeness)} arrived</span> (week of {fmtShortDate(a.period_start)}) · <span className="font-medium text-ink">{fmtPct(t.timeliness)} on time</span> (week of {fmtShortDate(t.period_start)})
    </p>
  );
}

/** Connections grouped by what they mean, e.g. all units it receives reports from together. */
function groupRelationships(rels: Rel[]): [string, Rel[]][] {
  const groups = new Map<string, Rel[]>();
  for (const r of rels) {
    const label = r.direction === "outgoing" ? REL_LABEL[r.relationship_type] : REL_IN[r.relationship_type];
    groups.set(label, [...(groups.get(label) ?? []), r]);
  }
  return [...groups.entries()];
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-2 uppercase">{title}{note && <span className="ml-1.5 font-normal tracking-normal normal-case">({note})</span>}</h3>
      {children}
    </section>
  );
}
