import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DataTable } from "@/components/data-display/DataTable";
import { FilterBar, FilterField } from "@/components/data-display/FilterBar";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { fmtPct } from "@/lib/format";
import { UNIT_TYPE } from "@/lib/labels";
import { api } from "@/services/api";
import type { NetworkNode, UnitType } from "@/types/api";
import { EDGE_STYLE, NetworkGraph, STATUS_STYLE } from "./NetworkGraph";
import { NodeDetails } from "./NodeDetails";

const TYPES: UnitType[] = ["rhu", "hospital", "laboratory", "hub"];
const SHAPE_ICON: Record<UnitType, React.ReactNode> = {
  rhu: <circle cx="8" cy="8" r="6" />,
  hospital: <rect x="2" y="3.5" width="12" height="9" rx="2.5" />,
  laboratory: <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" />,
  hub: <path d="M4.5 2h7L15 8l-3.5 6h-7L1 8Z" />,
};
const REL_LEGEND = { reports_through: "Reports through (submission pathway)", specimen_referral: "Sends specimens to (laboratory referral)", shared_resource: "Shares encoder / connection" } as const;

function Legend({ labels }: { labels: Record<string, string> }) {
  return (
    <div className="grid grid-cols-1 gap-4 text-xs text-ink sm:grid-cols-3">
      <div>
        <p className="mb-1.5 font-semibold text-ink-2">Unit type (shape)</p>
        <ul className="flex flex-col gap-1">
          {TYPES.map((t) => (
            <li key={t} className="flex items-center gap-2"><svg width="16" height="16" aria-hidden fill={STATUS_STYLE.normal.fill} stroke={STATUS_STYLE.normal.border} strokeWidth="1.5">{SHAPE_ICON[t]}</svg>{UNIT_TYPE[t]}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1.5 font-semibold text-ink-2">Reporting status (border)</p>
        <ul className="flex flex-col gap-1">
          {(["normal", "delayed", "missing", "no_schedule"] as const).map((s) => (
            <li key={s} className="flex items-center gap-2">
              <svg width="16" height="16" aria-hidden><circle cx="8" cy="8" r="5.5" fill={STATUS_STYLE[s].fill} stroke={STATUS_STYLE[s].border} strokeWidth={s === "missing" ? 3 : s === "delayed" ? 2 : 1.5} strokeDasharray={s === "delayed" ? "3 2" : s === "no_schedule" ? "1 2" : undefined} /></svg>
              {labels[s]}{s === "delayed" ? " (timeliness < 75%)" : s === "missing" ? " (completeness < 80%)" : ""}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1.5 font-semibold text-ink-2">Relationship (line, simulated)</p>
        <ul className="flex flex-col gap-1">
          {(Object.keys(EDGE_STYLE) as (keyof typeof EDGE_STYLE)[]).map((k) => (
            <li key={k} className="flex items-center gap-2">
              <svg width="24" height="8" aria-hidden><line x1="1" y1="4" x2="23" y2="4" stroke={EDGE_STYLE[k].color} strokeWidth="2" strokeDasharray={EDGE_STYLE[k].style === "dashed" ? "5 3" : EDGE_STYLE[k].style === "dotted" ? "1.5 2.5" : undefined} /></svg>
              {REL_LEGEND[k]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function NetworkPage() {
  const { meta } = useSession();
  const [params, setParams] = useSearchParams();
  const last = (meta?.weeks.length ?? 26) - 1;
  const DEFAULTS = { province: "", status: "", from: String(last - 3), to: String(last) };
  const [f, setF] = useState(DEFAULTS);
  const [types, setTypes] = useState<Set<UnitType>>(new Set(TYPES));
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"graph" | "list">("graph");
  const selected = params.get("unit");
  const setSelected = (id: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set("unit", id); else n.delete("unit"); return n; }, { replace: true });
  const q = useQuery({ queryKey: ["network", f.from, f.to], queryFn: () => api.network({ w_from: f.from, w_to: f.to }) });

  const visibleNodes = useMemo(() => (q.data?.nodes ?? []).filter((n) =>
    (!search || `${n.name} ${n.id}`.toLowerCase().includes(search.toLowerCase())) && (!f.province || n.province === f.province) && types.has(n.unit_type) && (!f.status || n.status === f.status)), [q.data, f, types, search]);
  const visible = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const node = q.data?.nodes.find((n) => n.id === selected) ?? null;
  const active = Object.entries(f).filter(([k, v]) => v !== DEFAULTS[k as keyof typeof DEFAULTS]).length + (types.size < TYPES.length ? 1 : 0);
  const weeks = meta?.weeks ?? [];

  return (
    <>
      <ScreenHeader screen="network" />
      <div className="mt-[25px]" />
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data ? <Loading label="Loading network" /> : !q.data.defined ? <EmptyState title="No network defined">{q.data.message}</EmptyState> : (
        <div className="iris-workspace-stack">
          <div className="iris-toolbar">
            <p className="iris-eyebrow">Synthetic reporting dependencies</p>
            <p className="text-xs text-ink-2">{visibleNodes.length} visible units / {q.data.nodes.length} total | {q.data.edges.filter((e) => visible.has(e.source) && visible.has(e.target)).length} defined connections</p>
          </div>
          <FilterBar activeCount={active + (search ? 1 : 0)} onReset={() => { setF(DEFAULTS); setTypes(new Set(TYPES)); setSearch(""); }} label="Filters"
            extra={<div className="flex rounded-md border border-line-strong bg-white p-0.5" role="group" aria-label="View">
              {(["graph", "list"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                  className={`min-h-10 rounded px-3 text-sm font-medium ${view === v ? "bg-teal-900 text-white" : "text-teal-900 hover:bg-aqua-50"}`}>{v === "graph" ? "Graph" : "List"}</button>
              ))}
            </div>}>
            <FilterField label="Search units">{(id) => <Input id={id} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Unit name or ID" />}</FilterField>
            <FilterField label="Province">
              {(id) => <Select id={id} value={f.province} onChange={(e) => setF({ ...f, province: e.target.value })}><option value="">All provinces</option>{meta?.provinces.map((p) => <option key={p}>{p}</option>)}</Select>}
            </FilterField>
            <FilterField label="From week">
              {(id) => <Select id={id} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: Number(e.target.value) > Number(f.to) ? e.target.value : f.to })}>{weeks.map((w) => <option key={w.week} value={w.week}>{w.label}</option>)}</Select>}
            </FilterField>
            <FilterField label="To week">
              {(id) => <Select id={id} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value, from: Number(e.target.value) < Number(f.from) ? e.target.value : f.from })}>{weeks.map((w) => <option key={w.week} value={w.week}>{w.label}</option>)}</Select>}
            </FilterField>
            <FilterField label="Simulated status">
              {(id) => <Select id={id} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Any status</option>{(["normal", "delayed", "missing", "no_schedule"] as const).map((s) => <option key={s} value={s}>{q.data!.status_labels[s]}</option>)}</Select>}
            </FilterField>
            <fieldset className="w-full md:w-auto">
              <legend className="mb-1 text-xs font-medium text-ink-2">Unit types</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2 md:min-h-10 md:items-center">
                {TYPES.map((t) => (
                  <Checkbox key={t} label={UNIT_TYPE[t]} checked={types.has(t)} onChange={(v) => { const n = new Set(types); if (v) n.add(t); else n.delete(t); setTypes(n); }} />
                ))}
              </div>
            </fieldset>
          </FilterBar>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Panel title="Reporting relationships" description="Select a unit to inspect its reporting history and connected concerns." motif="network" bodyClassName="p-0" className="min-w-0 overflow-hidden">
              {view === "graph" ? (
                <>
                  {visibleNodes.length === 0 && <div className="p-4"><EmptyState title="No units match these filters" /></div>}
                  <NetworkGraph nodes={q.data.nodes} edges={q.data.edges} visible={visible} selected={selected} onSelect={setSelected} />
                  <p className="border-t border-line px-4 py-2 text-xs text-ink-2">
                    Showing {visibleNodes.length} of {q.data.nodes.length} units · status for {weeks[Number(f.from)]?.label} to {weeks[Number(f.to)]?.label}. {q.data.note}
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
