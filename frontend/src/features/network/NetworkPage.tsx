import { useQuery } from "@tanstack/react-query";
import { Activity, Shapes } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DataTable } from "@/components/data-display/DataTable";
import { ChoiceFilter, MultiFilter, SearchFilter, type GlobalFilterKey } from "@/components/shell/GlobalFilterBar";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { useGlobalFilters, weekRangeLabel } from "@/hooks/useGlobalFilters";
import { useSession } from "@/hooks/useSession";
import { fmtPct } from "@/lib/format";
import { UNIT_TYPE } from "@/lib/labels";
import { api } from "@/services/api";
import type { NetworkNode, UnitType } from "@/types/api";
import { EDGE_STYLE, NetworkGraph, STATUS_STYLE } from "./NetworkGraph";
import { NodeDetails } from "./NodeDetails";

const TYPES: UnitType[] = ["rhu", "hospital", "laboratory", "hub"];
// Legend marks drawn the way the graph draws them.
const SHAPE_ICON: Record<UnitType, React.ReactNode> = {
  rhu: <circle cx="8" cy="8" r="4.5" fill={STATUS_STYLE.normal.color} />,
  hospital: <rect x="3" y="4.5" width="10" height="7" rx="2.2" fill={STATUS_STYLE.normal.color} />,
  laboratory: <path d="M8 2.5 13.5 8 8 13.5 2.5 8Z" fill={STATUS_STYLE.normal.color} />,
  hub: <><circle cx="8" cy="8" r="6.2" fill="#0B2A33" stroke={STATUS_STYLE.normal.color} strokeWidth="1.4" /><circle cx="8" cy="8" r="7.6" fill="none" stroke={STATUS_STYLE.normal.color} strokeOpacity="0.35" strokeWidth="0.8" /></>,
};
const SHAPE_NAME: Record<UnitType, string> = { rhu: "dot", hospital: "rounded square", laboratory: "diamond", hub: "dark orb" };
const REL_LEGEND = { reports_through: "Reports through (submission pathway)", specimen_referral: "Sends specimens to (laboratory referral)", shared_resource: "Shares encoder / connection" } as const;
const STATUS_NOTE = { normal: "", delayed: "timeliness < 75% · dashed ring", missing: "completeness < 80% · pulsing ring", no_schedule: "faded" } as const;

function Legend({ labels }: { labels: Record<string, string> }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
      <section>
        <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-2 uppercase">Unit type · shape</h3>
        <ul className="flex flex-col gap-1.5 text-[13px] text-ink">
          {TYPES.map((t) => (
            <li key={t} className="flex items-center gap-2.5"><svg width="16" height="16" aria-hidden className="shrink-0">{SHAPE_ICON[t]}</svg>{UNIT_TYPE[t]}<span className="text-xs text-ink-2">{SHAPE_NAME[t]}</span></li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-2 uppercase">Reporting status · colour and ring</h3>
        <ul className="flex flex-col gap-1.5 text-[13px] text-ink">
          {(["normal", "delayed", "missing", "no_schedule"] as const).map((s) => (
            <li key={s} className="flex items-center gap-2.5">
              <svg width="16" height="16" aria-hidden className="shrink-0">
                <circle cx="8" cy="8" r="4" fill={STATUS_STYLE[s].color} fillOpacity={STATUS_STYLE[s].alpha} />
                {s === "missing" && <circle cx="8" cy="8" r="7" fill="none" stroke={STATUS_STYLE[s].color} strokeWidth="1.3" />}
                {s === "delayed" && <circle cx="8" cy="8" r="7" fill="none" stroke={STATUS_STYLE[s].color} strokeWidth="1.2" strokeDasharray="2 1.6" />}
              </svg>
              <span>{labels[s]}{STATUS_NOTE[s] && <span className="ml-1.5 text-xs text-ink-2">{STATUS_NOTE[s]}</span>}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-2 uppercase">Relationship · line (simulated)</h3>
        <ul className="flex flex-col gap-1.5 text-[13px] text-ink">
          {(Object.keys(EDGE_STYLE) as (keyof typeof EDGE_STYLE)[]).map((k) => (
            <li key={k} className="flex items-center gap-2.5">
              <svg width="26" height="10" aria-hidden className="shrink-0">
                <line x1="1" y1="5" x2="21" y2="5" stroke={`rgb(${EDGE_STYLE[k].color})`} strokeWidth={EDGE_STYLE[k].width * 1.6} strokeDasharray={EDGE_STYLE[k].dash.join(" ") || undefined} />
                {EDGE_STYLE[k].arrow && <path d="M21 2 25 5 21 8Z" fill={`rgb(${EDGE_STYLE[k].color})`} />}
              </svg>
              {REL_LEGEND[k]}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-2">Moving dots show the direction reports or specimens travel.</p>
      </section>
    </div>
  );
}

export function NetworkPage() {
  const [params, setParams] = useSearchParams();
  // Region and weeks come from the shared filter bar; status, unit types and search are this screen's own.
  const { meta } = useSession();
  const { filters: g } = useGlobalFilters();
  const [status, setStatus] = useState("");
  const [types, setTypes] = useState<Set<UnitType>>(new Set(TYPES));
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"graph" | "list">("graph");
  const selected = params.get("unit");
  const setSelected = (id: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set("unit", id); else n.delete("unit"); return n; }, { replace: true });
  const q = useQuery({ queryKey: ["network", g.from, g.to], queryFn: () => api.network({ w_from: g.from, w_to: g.to }) });

  const visibleNodes = useMemo(() => (q.data?.nodes ?? []).filter((n) =>
    (!search || `${n.name} ${n.id}`.toLowerCase().includes(search.toLowerCase())) && (!g.region || n.province === g.region) && types.has(n.unit_type) && (!status || n.status === status)), [q.data, g.region, status, types, search]);
  const visible = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const node = q.data?.nodes.find((n) => n.id === selected) ?? null;
  const ownChanged = (status ? 1 : 0) + (types.size < TYPES.length ? 1 : 0) + (search ? 1 : 0);
  const statusLabels = q.data?.status_labels ?? {};
  const viewSwitch = <div className="flex rounded-md border border-line-strong bg-white p-0.5" role="group" aria-label="View">
      {(["graph", "list"] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
          className={`min-h-9 rounded px-3 text-sm font-medium ${view === v ? "bg-teal-900 text-white" : "text-teal-900 hover:bg-aqua-50"}`}>{v === "graph" ? "Graph" : "List"}</button>
      ))}
    </div>;
  const filterSlots = {
    hide: ["disease", "group"] as GlobalFilterKey[],
    extra: <>
      <ChoiceFilter label="Status" icon={<Activity aria-hidden />} value={status} onChange={setStatus}
        options={[{ value: "", label: "Any status" }, ...(["normal", "delayed", "missing", "no_schedule"] as const).map((s) => ({ value: s, label: statusLabels[s] ?? s }))]} />
      <MultiFilter label="Unit types" icon={<Shapes aria-hidden />} values={types} onChange={setTypes} options={TYPES.map((t) => ({ value: t, label: UNIT_TYPE[t] }))} />
      <SearchFilter label="Find a unit" value={search} onChange={setSearch} placeholder="Name or ID" />
    </>,
    extraChanged: ownChanged,
    onResetExtra: () => { setStatus(""); setTypes(new Set(TYPES)); setSearch(""); },
  };

  return (
    <>
      <ScreenHeader screen="network" filterBar={filterSlots} />
      <div className="mt-[25px]" />
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data ? <Loading label="Loading network" /> : !q.data.defined ? <EmptyState title="No network defined">{q.data.message}</EmptyState> : (
        <div className="iris-workspace-stack">
          <div className="iris-toolbar">
            <p className="iris-eyebrow">Synthetic reporting dependencies</p>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-ink-2">{visibleNodes.length} visible units / {q.data.nodes.length} total | {q.data.edges.filter((e) => visible.has(e.source) && visible.has(e.target)).length} defined connections</p>
              {viewSwitch}
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Panel title="Reporting relationships" description="Select a unit to inspect its reporting history and connected concerns." motif="network" bodyClassName="p-0" className="min-w-0 overflow-hidden">
              {view === "graph" ? (
                <>
                  {visibleNodes.length === 0 && <div className="p-4"><EmptyState title="No units match these filters" /></div>}
                  <NetworkGraph nodes={q.data.nodes} edges={q.data.edges} visible={visible} selected={selected} onSelect={setSelected} />
                  <p className="border-t border-line px-4 py-2 text-xs text-ink-2">
                    Showing {visibleNodes.length} of {q.data.nodes.length} units · status for {weekRangeLabel(meta?.weeks ?? [], g.from, g.to)}. {q.data.note}
                  </p>
                </>
              ) : (
                <div className="p-4 md:p-0">
                  <DataTable<NetworkNode>
                    caption="Reporting units (list view of the network)"
                    rows={visibleNodes}
                    rowKey={(n) => n.id}
                    onRowClick={(n) => setSelected(n.id)}
                    rowClassName={(n) => (n.id === selected ? "bg-aqua-50" : undefined)}
                    mobileTitle={(n) => n.name}
                    minWidth={640}
                    emptyState={<div className="p-4"><EmptyState title="No units match these filters" /></div>}
                    columns={[
                      { key: "name", header: "Unit", hideOnMobile: true, cell: (n) => <button type="button" className="text-left font-medium text-teal-900 hover:underline" onClick={() => setSelected(n.id)}>{n.name}</button> },
                      { key: "type", header: "Type", cell: (n) => UNIT_TYPE[n.unit_type] },
                      { key: "province", header: "Province", cell: (n) => n.province },
                      { key: "status", header: "Status", cell: (n) => <Badge tone={n.status === "missing" ? "critical" : n.status === "delayed" ? "attention" : "positive"}>{n.status_label}</Badge> },
                      { key: "comp", header: "Completeness", align: "right", cell: (n) => fmtPct(n.completeness) },
                      { key: "time", header: "Timeliness", align: "right", cell: (n) => fmtPct(n.timeliness) },
                      { key: "conn", header: "Connections", align: "right", cell: (n) => n.degree },
                      { key: "open", header: "Open concerns", align: "right", cell: (n) => n.open_concerns },
                    ]}
                  />
                </div>
              )}
            </Panel>
            <Panel variant="secondary" motif="verify" title={node ? "Unit details" : "Pick a unit"} className="min-w-0" actions={node ? <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Clear</Button> : undefined}>
              {node ? <NodeDetails node={node} /> : <p className="text-sm text-ink-2">Click a shape in the map, or use the List view, to see a unit's reporting and concerns.</p>}
            </Panel>
          </div>
          <Panel title="Network legend" variant="secondary"><Legend labels={q.data.status_labels} /></Panel>
        </div>
      )}
    </>
  );
}
