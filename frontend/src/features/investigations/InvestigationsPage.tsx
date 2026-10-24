import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { type SortState } from "@/components/data-display/DataTable";
import { ChipFilter, FilterBar, FilterField } from "@/components/data-display/FilterBar";
import { MetricCard } from "@/components/data-display/MetricCard";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, InlineError, Loading } from "@/components/ui/states";
import { useGlobalFilters } from "@/hooks/useGlobalFilters";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/useToast";
import { SEVERITY } from "@/lib/labels";
import { mergeSearch } from "@/lib/url";
import { api } from "@/services/api";
import { QueueTable } from "../overview/QueueTable";

const DEFAULTS = { status: "active", concern_type: "", severity: "", search: "" };

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
  const [url, setUrl] = useSearchParams();
  const f = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, url.get(k) ?? v])) as typeof DEFAULTS;
  const page = Math.max(1, Number(url.get("page")) || 1);
  const sort: SortState = { key: ["severity", "updated_at", "period_start"].includes(url.get("sort") ?? "") ? url.get("sort")! : "updated_at", order: url.get("order") === "asc" ? "asc" : "desc" };
  const setPage = (n: number) => setUrl((p) => { p.set("page", String(n)); return p; }, { replace: true });
  // Page filters merge into the URL; changing one returns to page 1.
  const keepEmpty = Object.keys(DEFAULTS).filter((k) => DEFAULTS[k as keyof typeof DEFAULTS] !== "");
  const setF = (v: typeof DEFAULTS) => setUrl((p) => mergeSearch(p, { ...v, page: null }, keepEmpty), { replace: true });
  const params = { ...f, page, page_size: 20, sort: sort.key, order: sort.order };
  // Region comes from the shared filter bar; coordinators and RHU staff are already limited to their own area.
  const scoped = role === "provincial_coordinator" || role === "rhu_staff";
  const { filters: g, set: setGlobal } = useGlobalFilters();
  const query = { ...params, province: scoped ? "" : g.region };
  const q = useQuery({ queryKey: ["concerns", query], queryFn: () => api.concerns(query), placeholderData: (p) => p });
  const set = (patch: Partial<typeof DEFAULTS>) => setUrl((p) => mergeSearch(p, { ...patch, page: null }, keepEmpty), { replace: true });
  const hidden = (["concern_type", "severity"] as const).filter((k) => f[k]).length + (!scoped && g.region ? 1 : 0);
  return (
    <>
      {/* Region sits with this screen's own filters below; it is the shared region, so other screens follow it. */}
      <ScreenHeader screen="investigations" filterBar={{ hide: ["region", "disease", "weeks", "group"] }}>
        {can("detection.run") && <div className="flex justify-end"><RunDetection /></div>}
      </ScreenHeader>
      <div className="mt-[25px]" />
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
          <FilterBar activeCount={hidden} onReset={() => setUrl((p) => mergeSearch(p, { concern_type: "", severity: "", region: "", page: null }, keepEmpty), { replace: true })} label="Filters"
            primary={<div className="w-full md:w-72"><label htmlFor="cs" className="sr-only">Search concerns</label>
              <Input id="cs" type="search" placeholder="Search by concern ID or keyword" value={f.search} onChange={(e) => set({ search: e.target.value })} /></div>}>
            {!scoped && (
              <FilterField label="Region">
                {(id) => (
                  <Select id={id} value={g.region} onChange={(e) => setGlobal({ region: e.target.value })}>
                    <option value="">All provinces</option>
                    {meta?.provinces.map((p) => <option key={p}>{p}</option>)}
                  </Select>
                )}
              </FilterField>
            )}
            <FilterField label="Type">
              {(id) => (
                <Select id={id} value={f.concern_type} onChange={(e) => set({ concern_type: e.target.value })}>
                  <option value="">All types</option>
                  {meta && Object.entries(meta.labels.concern_type).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              )}
            </FilterField>
            <FilterField label="Priority" className="md:w-40">
              {(id) => (
                <Select id={id} value={f.severity} onChange={(e) => set({ severity: e.target.value })}>
                  <option value="">All</option>
                  {Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              )}
            </FilterField>
          </FilterBar>
        </div>
        {q.error ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : !q.data ? <div className="px-4"><Loading /></div> : (
          <>
            <QueueTable rows={q.data.rows} caption="Reporting concerns" showVerification sort={sort}
              onSort={(v) => setUrl((p) => mergeSearch(p, { sort: v.key, order: v.order, page: null }), { replace: true })}
              emptyState={<div className="p-4"><EmptyState title="No concerns match" action={<Button size="sm" variant="secondary" onClick={() => { setF(DEFAULTS); }}>Show all open concerns</Button>} /></div>} />
            {q.data.pages > 1 && <div className="border-t border-line px-4 py-3"><Pagination page={q.data.page} pages={q.data.pages} total={q.data.total} pageSize={q.data.page_size} onPage={setPage} /></div>}
          </>
        )}
      </Panel>
    </>
  );
}
