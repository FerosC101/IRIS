import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useState } from "react";
import { ChipFilter, FilterBar, FilterField } from "@/components/data-display/FilterBar";
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
import { QueueTable } from "../overview/QueueTable";

const DEFAULTS = { status: "active", concern_type: "", severity: "", province: "", search: "" };

function RunDetection() {
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
      <Button variant="secondary" onClick={() => setOpen(true)}><Play aria-hidden /> Check for new concerns</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Check for new concerns"
          description="Scans the demo data for unusual reporting and adds any new concerns. Existing ones are not changed."
          footer={<>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
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
  const [f, setF] = useState(DEFAULTS);
  const [page, setPage] = useState(1);
  const params = { ...f, page, page_size: 20, sort: "updated_at", order: "desc" };
  const q = useQuery({ queryKey: ["concerns", params], queryFn: () => api.concerns(params), placeholderData: (p) => p });
  const set = (patch: Partial<typeof DEFAULTS>) => { setF({ ...f, ...patch }); setPage(1); };
  const hidden = (["concern_type", "severity", "province"] as const).filter((k) => f[k]).length;
  return (
    <>
      <PageHeader title="Concerns" description="Possible reporting problems found in the data. Open one to review it."
        actions={can("detection.run") ? <RunDetection /> : undefined} />
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
          <ChipFilter label="Status" value={f.status} onChange={(v) => set({ status: v })} options={[
            { value: "active", label: "Open" },
            { value: "open", label: "New" },
            { value: "clarification_requested", label: "Waiting for reply" },
            { value: "in_investigation", label: "Being fixed" },
            { value: "closed", label: "Closed" },
            { value: "", label: "All" },
          ]} />
          <FilterBar activeCount={hidden} onReset={() => set({ concern_type: "", severity: "", province: "" })} label="Filters"
            primary={<div className="w-full md:w-72"><label htmlFor="cs" className="sr-only">Search concerns</label>
              <Input id="cs" type="search" placeholder="Search by unit, ID or keyword" value={f.search} onChange={(e) => set({ search: e.target.value })} /></div>}>
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
            <QueueTable rows={q.data.rows} caption="Reporting concerns"
              emptyState={<div className="p-4"><EmptyState title="No concerns match" action={<Button size="sm" variant="secondary" onClick={() => { setF(DEFAULTS); setPage(1); }}>Show all open concerns</Button>} /></div>} />
            {q.data.pages > 1 && <div className="border-t border-line px-4 py-3"><Pagination page={q.data.page} pages={q.data.pages} total={q.data.total} pageSize={q.data.page_size} onPage={setPage} /></div>}
          </>
        )}
      </Panel>
    </>
  );
}
