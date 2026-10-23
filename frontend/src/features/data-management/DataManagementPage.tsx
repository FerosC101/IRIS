import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SimulatedTag } from "@/components/data-display/badges";
import { DataTable } from "@/components/data-display/DataTable";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, InlineError, Loading } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/useToast";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { UNIT_TYPE } from "@/lib/labels";
import { api } from "@/services/api";
import type { ImportRecord, UnitRow } from "@/types/api";
import { DatasetRegistry } from "./DatasetRegistry";
export { ValidationBadge } from "./DatasetBadges";
import { ResetDemo } from "./ResetDemo";

export function ImportHistory({ rows }: { rows: ImportRecord[] }) {
  if (!rows.length) return <EmptyState title="No imports yet">Files uploaded through the CSV import appear here, including rejected ones.</EmptyState>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((i) => (
        <li key={i.id} className="py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-ink-2">{i.id}</span>
            <span className="text-sm font-medium">{i.filename}</span>
            <Badge tone={i.status === "accepted" ? "positive" : i.status === "rejected" ? "critical" : "neutral"}>{i.status === "accepted" ? "Accepted" : i.status === "rejected" ? "Rejected" : "Cancelled"}</Badge>
          </div>
          <p className="text-xs text-ink-2">{fmtDateTime(i.at)} · {i.by ?? "—"} · {fmtNum(i.row_count)} rows{i.dataset_id ? <> · <Link to={`/data/datasets/${i.dataset_id}`} className="text-teal-900 hover:underline">{i.dataset_id}</Link></> : null}</p>
          {(i.errors.length > 0 || i.warnings.length > 0) && (
            <details className="mt-1.5 text-[13px]">
              <summary className="cursor-pointer font-medium text-teal-900">{i.errors.length} error(s), {i.warnings.length} warning(s)</summary>
              <ul className="mt-1 list-disc pl-5 text-ink">{[...i.errors, ...i.warnings].slice(0, 20).map((e, k) => <li key={k}>{e.row ? `Row ${e.row}${e.column ? `, ${e.column}` : ""}: ` : ""}{e.message}</li>)}</ul>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

function ImportsTab() {
  const q = useQuery({ queryKey: ["imports"], queryFn: api.imports });
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Loading />;
  return <Panel title="Import history" description="Every upload attempt, with its validation errors."><ImportHistory rows={q.data} /></Panel>;
}

function UnitDialog({ unit, onClose }: { unit: UnitRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState<Pick<UnitRow, "name" | "active" | "is_sentinel" | "notes"> | null>(null);
  const cur = v ?? (unit ? { name: unit.name, active: unit.active, is_sentinel: unit.is_sentinel, notes: unit.notes } : null);
  const m = useMutation({
    mutationFn: () => {
      const changes: Record<string, unknown> = {};
      if (cur && unit) for (const k of ["name", "active", "is_sentinel", "notes"] as const) if (cur[k] !== unit[k]) changes[k] = cur[k];
      return api.patchUnit(unit!.id, changes);
    },
    onSuccess: () => { qc.invalidateQueries(); toast("Reporting unit updated."); setV(null); onClose(); },
  });
  return (
    <Dialog open={!!unit} onOpenChange={(o) => { if (!o) { setV(null); m.reset(); onClose(); } }}>
      {unit && cur && (
        <DialogContent title={`Edit ${unit.name}`} description="Metadata changes are recorded in the system activity log. Reporting relationships are defined by the dataset and cannot be edited here."
          footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => m.mutate()} disabled={m.isPending || cur.name.trim().length < 3}>{m.isPending ? "Saving…" : "Save changes"}</Button></>}>
          <div className="flex flex-col gap-4">
            <Field label="Display name" error={cur.name.trim().length < 3 ? "Use at least 3 characters." : undefined}>{(p) => <Input {...p} value={cur.name} onChange={(e) => setV({ ...cur, name: e.target.value })} />}</Field>
            <Checkbox label="Active" description="Inactive units stay in historical data." checked={cur.active} onChange={(x) => setV({ ...cur, active: x })} />
            <Checkbox label="Sentinel site" checked={cur.is_sentinel} onChange={(x) => setV({ ...cur, is_sentinel: x })} />
            <Field label="Notes" optional>{(p) => <Textarea {...p} value={cur.notes} onChange={(e) => setV({ ...cur, notes: e.target.value })} />}</Field>
            <InlineError error={m.error} />
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function UnitsTab() {
  const { can } = useSession();
  const [edit, setEdit] = useState<UnitRow | null>(null);
  const q = useQuery({ queryKey: ["units"], queryFn: api.units });
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Loading />;
  return (
    <Panel title="Reporting units" description={can("units.manage") ? "All units are simulated. Select Edit to change metadata." : "All units are simulated. Only administrators can edit metadata."} bodyClassName="p-0">
      <div className="px-4 md:px-0">
        <DataTable<UnitRow> caption="Reporting units" rows={q.data} rowKey={(u) => u.id} mobileTitle={(u) => u.name} minWidth={820}
          columns={[
            { key: "name", header: "Unit", hideOnMobile: true, cell: (u) => <span className="font-medium">{u.name}</span> },
            { key: "id", header: "ID", cell: (u) => <span className="font-mono text-xs">{u.id}</span> },
            { key: "type", header: "Type", cell: (u) => UNIT_TYPE[u.unit_type] },
            { key: "prov", header: "Province", cell: (u) => u.province },
            { key: "active", header: "Status", cell: (u) => <div className="flex flex-wrap gap-1">{u.active ? <Badge tone="positive">Active</Badge> : <Badge>Inactive</Badge>}{u.is_sentinel && <Badge tone="info">Sentinel</Badge>}<SimulatedTag /></div> },
            { key: "notes", header: "Notes", className: "max-w-xs", cell: (u) => u.notes || <span className="text-ink-2">—</span> },
            ...(can("units.manage") ? [{ key: "edit", header: "", cell: (u: UnitRow) => <Button variant="secondary" size="sm" onClick={() => setEdit(u)} aria-label={`Edit ${u.name}`}><Pencil aria-hidden /> Edit</Button> }] : []),
          ]} />
      </div>
      <UnitDialog unit={edit} onClose={() => setEdit(null)} />
    </Panel>
  );
}

function AuditTab() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const p = { page, entity_type: type, search };
  const q = useQuery({ queryKey: ["audit", p], queryFn: () => api.audit(p), placeholderData: (x) => x });
  return (
    <Panel title="System activity" description="Every change made through IRIS, newest first." bodyClassName="p-0">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row">
        <div className="sm:w-48"><label htmlFor="at" className="mb-1 block text-xs font-medium text-ink-2">Entity</label>
          <Select id="at" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All</option>{["concern", "plan", "assignment", "record", "dataset", "import", "unit", "experiment", "system"].map((t) => <option key={t}>{t}</option>)}
          </Select></div>
        <div className="sm:w-72"><label htmlFor="as" className="mb-1 block text-xs font-medium text-ink-2">Search</label>
          <Input id="as" type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
      </div>
      {q.error ? <div className="p-4"><ErrorState error={q.error} /></div> : !q.data ? <div className="p-4"><Loading /></div> : (
        <>
          <ul className="divide-y divide-line">
            {q.data.rows.map((e) => (
              <li key={e.id} className="px-4 py-2.5">
                <p className="text-sm text-ink">{e.summary}</p>
                <p className="text-xs text-ink-2">{fmtDateTime(e.at)} · {e.actor} · <span className="font-mono">{e.action}</span> · {e.entity_type} {e.entity_id}</p>
              </li>
            ))}
            {q.data.rows.length === 0 && <li className="p-4"><EmptyState title="No activity matches" /></li>}
          </ul>
          <div className="border-t border-line px-4 py-3"><Pagination page={q.data.page} pages={q.data.pages} total={q.data.total} pageSize={q.data.page_size} onPage={setPage} /></div>
        </>
      )}
    </Panel>
  );
}

export function DataManagementPage() {
  const { can } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "datasets";
  const tabs = [
    { value: "datasets", label: "Datasets" },
    { value: "imports", label: "Import history" },
    { value: "units", label: "Reporting units" },
    ...(can("audit.view") ? [{ value: "activity", label: "System activity" }] : []),
    { value: "scenarios", label: "Demo scenarios" },
  ];
  return (
    <>
      <ScreenHeader screen="data" />
      <div className="mt-[25px]" />
      <Tabs value={tab} onValueChange={(v) => setParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", v); return next; })}>
        <TabsList label="Data management sections" tabs={tabs} />
        <TabsContent value="datasets"><DatasetRegistry /></TabsContent>
        <TabsContent value="imports"><ImportsTab /></TabsContent>
        <TabsContent value="units"><UnitsTab /></TabsContent>
        {can("audit.view") && <TabsContent value="activity"><AuditTab /></TabsContent>}
        <TabsContent value="scenarios">
          <Panel title="Demo scenarios" description="Simulated disruptions injected into the demo dataset. Choose which to include and regenerate the data. The random seed is fixed, so results are reproducible.">
            <ResetDemo configurable />
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
}
