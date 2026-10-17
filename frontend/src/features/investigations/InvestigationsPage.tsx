import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DataTable, type SortState } from "@/components/data-display/DataTable";
import { ConcernStatusBadge, SeverityBadge, VerificationBadge } from "@/components/data-display/badges";
import { fmtDate } from "@/lib/format";
import type { ConcernStatus, QueueRow } from "@/types/api";
import { useState } from "react";
import { ChipFilter, FilterBar, FilterField } from "@/components/data-display/FilterBar";
import { MetricCard } from "@/components/data-display/MetricCard";
import { PageHeader } from "@/components/data-display/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, InlineError, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/useToast";
import { SEVERITY } from "@/lib/labels";
import { api } from "@/services/api";


const DEFAULTS = { status: "active", concern_type: "", severity: "", province: "", search: "" };

export function RunDetection() {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("network");
  const qc = useQueryClient();
  const toast = useToast();
  const { meta } = useSession();
  const m = useMutation({
    mutationFn: () => api.runDetection(method),
    onSuccess: (r) => {
      qc.invalidateQueries();
      setOpen(false);
      toast(r.created.length ? `${r.created.length} new concern(s) found: ${r.created.join(", ")}.` : "No new concerns found. Everything flagged is already listed.");
    },
  });
  return (
    <>
      <Button variant="secondary" onClick={() => { m.reset(); setOpen(true); }}><Play aria-hidden /> Check for new concerns</Button>
      <Dialog open={open} onOpenChange={(value) => { if (!m.isPending) setOpen(value); }}>
        <DialogContent title="Check for new concerns"
          description="Scans the full demo dataset using the selected method and adds new concerns. Chart and queue filters do not restrict this run. Existing concerns are not changed."
          footer={<>
            <Button variant="secondary" disabled={m.isPending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Checking…" : "Check now"}</Button>
          </>}>
          <div className="flex flex-col gap-3">
            <Field label="How to check" hint="Network-aware also spots problems shared by connected units. The others look at each unit alone.">
              {(p) => (
                <Select {...p} value={method} onChange={(e) => setMethod(e.target.value)}>
                  {meta && Object.entries(meta.labels.method).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              )}
            </Field>
            <InlineError error={m.error} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function InvestigationsPage() {
  const { meta, role, can } = useSession();
  const overview = useQuery({ queryKey: ["overview", "all", "active"], queryFn: () => api.overview({ period: "all", status: "active" }) });
  const counts = overview.data?.counts;
  const navigate = useNavigate();
  const [url, setUrl] = useSearchParams();
  const f = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, url.get(k) ?? v])) as typeof DEFAULTS;
  const page = Math.max(1, Number(url.get("page")) || 1);
  const sort: SortState = { key: ["severity", "updated_at", "period_start"].includes(url.get("sort") ?? "") ? url.get("sort")! : "updated_at", order: url.get("order") === "asc" ? "asc" : "desc" };
  const setPage = (n: number) => setUrl((p) => { p.set("page", String(n)); return p; }, { replace: true });
  const setF = (v: typeof DEFAULTS) => setUrl(v, { replace: true });
  const params = { ...f, page, page_size: 20, sort: sort.key, order: sort.order };
  const q = useQuery({ queryKey: ["concerns", params], queryFn: () => api.concerns(params), placeholderData: (p) => p });
  const set = (patch: Partial<typeof DEFAULTS>) => setUrl({ ...f, ...patch, sort: sort.key, order: sort.order }, { replace: true });
  const hidden = (["concern_type", "severity", "province"] as const).filter((k) => f[k]).length;
  return (
    <>
      <PageHeader title="Investigation Queue" description="Review and prioritize suspected reporting disruptions."
        actions={can("detection.run") ? <RunDetection /> : undefined} />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="New concerns" value={counts?.new ?? "Unavailable"} detail="Awaiting initial review across your scope." motif="records" />
        <MetricCard label="Under review" value={counts?.under_review ?? "Unavailable"} detail="Evidence is being verified." motif="verify" />
        <MetricCard label="Waiting for reply" value={counts?.clarification_requested ?? "Unavailable"} detail="Clarification requested from reporting units." motif="network" />
        <MetricCard label="Being investigated" value={counts?.in_investigation ?? "Unavailable"} detail="Active corrective investigation." motif="trends" />
      </div>
      {overview.error && <ErrorState error={overview.error} onRetry={() => overview.refetch()} title="Investigation indicators unavailable" />}
      <Panel title="Investigation queue" description="Filter reporting concerns and open a record to review evidence, assign an owner, or record a decision." motif="records" bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
          <ChipFilter label="Status" value={f.status} onChange={(v) => set({ status: v })} options={[
            { value: "active", label: "Open" },
            { value: "open", label: "New" },
            { value: "under_review", label: "Under review" },
            { value: "clarification_requested", label: "Waiting for reply" },
            { value: "in_investigation", label: "Being fixed" },
            { value: "closed", label: "Closed" },
            { value: "", label: "All" },
          ]} />
          <FilterBar activeCount={hidden} onReset={() => set({ concern_type: "", severity: "", province: "" })} label="Filters"
            primary={<div className="w-full md:w-72"><label htmlFor="cs" className="sr-only">Search concerns</label>
              <Input id="cs" type="search" placeholder="Search by concern ID or keyword" value={f.search} onChange={(e) => set({ search: e.target.value })} /></div>}>
            <FilterField label="Type">
              {(id) => (
                <Select id={id} value={f.concern_type} onChange={(e) => set({ concern_type: e.target.value })}>
                  <option value="">All types</option>
                  {meta && Object.entries(meta.labels.concern_type).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              )}
            </FilterField>
            <FilterField label="Priority" className="w-full md:w-40">
              {(id) => (
                <Select id={id} value={f.severity} onChange={(e) => set({ severity: e.target.value })}>
                  <option value="">All</option>
                  {Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              )}
            </FilterField>
            {role !== "provincial_coordinator" && role !== "rhu_staff" && (
              <FilterField label="Province" className="w-full md:w-36">
                {(id) => (
                  <Select id={id} value={f.province} onChange={(e) => set({ province: e.target.value })}>
                    <option value="">All</option>
                    {meta?.provinces.map((p) => <option key={p}>{p}</option>)}
                  </Select>
                )}
              </FilterField>
            )}
          </FilterBar>
        </div>
        {q.error ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : !q.data ? <div className="px-4"><Loading /></div> : (
          <>
            <DataTable<QueueRow> rows={q.data.rows} caption="Reporting concerns" rowKey={(r) => r.id}
              onRowClick={(r) => navigate(r.link)} mobileTitle={(r) => <Link to={r.link}>{r.title}</Link>} minWidth={1080}
              sort={sort} onSort={(v) => setUrl({ ...f, sort: v.key, order: v.order }, { replace: true })}
              columns={[
                { key: "id", header: "Concern", cell: (r) => <Link to={r.link} className="font-semibold text-info-ink hover:underline">{r.id}</Link> },
                { key: "severity", header: "Priority", sortKey: "severity", cell: (r) => <SeverityBadge severity={r.severity} /> },
                { key: "unit", header: "Affected entities", cell: (r) => r.units_label },
                { key: "title", header: "Suspected disruption", cell: (r) => <Link to={r.link} className="hover:underline">{r.title}</Link> },
                { key: "status", header: "Status", cell: (r) => <ConcernStatusBadge status={r.status as ConcernStatus} /> },
                { key: "verification", header: "Verification", cell: (r) => <VerificationBadge verification={r.verification ?? "unverified"} /> },
                { key: "assigned", header: "Reviewer", cell: (r) => r.assigned ?? "Unassigned" },
                { key: "updated", header: "Updated", sortKey: "updated_at", cell: (r) => fmtDate(r.updated_at) },
              ]}
              emptyState={<div className="p-4"><EmptyState title="No concerns match" action={<Button size="sm" variant="secondary" onClick={() => { setF(DEFAULTS); }}>Show all open concerns</Button>} /></div>} />
            {q.data.pages > 1 && <div className="border-t border-line px-4 py-3"><Pagination page={q.data.page} pages={q.data.pages} total={q.data.total} pageSize={q.data.page_size} onPage={setPage} /></div>}
          </>
        )}
      </Panel>
    </>
  );
}
