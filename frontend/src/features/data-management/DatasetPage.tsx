import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DesignationBadge } from "@/components/data-display/badges";
import { SimpleTable } from "@/components/data-display/charts";
import { PageHeader } from "@/components/data-display/PageHeader";
import { MetricCard } from "@/components/data-display/MetricCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { KeyValue, Panel } from "@/components/ui/panel";
import { ErrorState, InlineError, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/useToast";
import { fmtDateTime, fmtNum, fmtPct, fmtPeriod } from "@/lib/format";
import { api } from "@/services/api";
import { ImportHistory } from "./DataManagementPage";
import { ValidationBadge } from "./DatasetBadges";

export function DatasetPage() {
  const { id = "" } = useParams();
  const { can } = useSession();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [del, setDel] = useState(false);
  const q = useQuery({ queryKey: ["dataset", id], queryFn: () => api.dataset(id) });
  const m = useMutation({ mutationFn: () => api.deleteDataset(id), onSuccess: () => { qc.invalidateQueries(); toast("Dataset deleted."); nav("/data"); } });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loading />;
  const d = q.data;
  return (
    <>
      <PageHeader title={d.name} breadcrumbs={[{ label: "Data & Models", to: "/data" }, { label: d.id }]} description={d.description}
        meta={<><DesignationBadge designation={d.designation} /><ValidationBadge status={d.validation_status} /></>}
        actions={<>
          <Link to={`/reports?dataset=${d.id}`} className={buttonVariants({ variant: "secondary" })}>Explore data</Link>
          {!d.is_demo && can("datasets.manage") && <Button variant="danger" onClick={() => setDel(true)}><Trash2 aria-hidden /> Delete</Button>}
        </>} />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Received records" value={fmtNum(d.quality.rows)} detail="Stored records; not a measure of reporting completeness." motif="records" />
        <MetricCard label="Explicit zero values" value={fmtNum(d.quality.value_status.zero)} detail="Observed zero counts remain separate from missing data." motif="trends" />
        <MetricCard label="Blank received values" value={fmtNum(d.quality.value_status.blank)} detail="Records received without a reported value." motif="verify" />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Panel title="Provenance and metadata" motif="records">
          <KeyValue items={[
            { label: "Dataset ID", value: <span className="font-mono text-xs">{d.id}</span> },
            { label: "Source", value: d.source },
            { label: "Designation", value: <DesignationBadge designation={d.designation} /> },
            { label: "Geographic level", value: d.geographic_level },
            { label: "Date coverage", value: d.coverage_start ? fmtPeriod(d.coverage_start, d.coverage_end) : "—" },
            { label: "Row count", value: fmtNum(d.row_count) },
            { label: "Imported", value: `${fmtDateTime(d.imported_at)}${d.imported_by_name ? ` by ${d.imported_by_name}` : ""}` },
            { label: "Concerns raised from it", value: String(d.concerns) },
            { label: "Reporting schedule", value: d.has_expectations ? "Defined" : "Not defined" },
            { label: "Timestamps", value: d.has_timestamps ? "Due and received" : "None" },
            { label: "Reporting units", value: d.has_units || d.has_expectations ? "Yes" : "No (area-level only)" },
          ]} />
        </Panel>
        <Panel title="Known limitations" variant="secondary" motif="verify"><ul className="list-disc space-y-3 pl-5 text-sm">{d.known_limitations.map((l) => <li key={l}>{l}</li>)}</ul>{!d.known_limitations.length && <p className="text-sm text-ink-2">No limitations were recorded. This does not establish suitability for a particular analysis.</p>}</Panel>
        <Panel title="Data dictionary" className="iris-records-table lg:col-span-2" motif="records">
          <div className="overflow-x-auto" role="region" aria-label="Dataset dictionary" tabIndex={0}><SimpleTable head={["Field", "Source column", "Label", "Description"]} rows={d.data_dictionary.map((x) => [x.field, x.source_column ?? "—", x.label, x.description])} /></div>
        </Panel>
        <Panel title="Data quality" motif="trends" className="iris-records-table">
          <div className="flex flex-col gap-2 text-sm">
            <p>{fmtNum(d.quality.value_status.reported)} reported · {fmtNum(d.quality.value_status.zero)} zero · {fmtNum(d.quality.value_status.blank)} blank values</p>
            {d.quality.expected_available && <p>{fmtNum(d.quality.not_received)} expected reports not received · {fmtNum(d.quality.late)} late</p>}
            <p>{fmtNum(d.quality.duplicates)} duplicate records</p>
            <div className="overflow-x-auto" role="region" aria-label="Dataset field quality" tabIndex={0}><SimpleTable head={["Field", "Missing", "Share"]} rows={d.quality.fields.map((x) => [x.label, fmtNum(x.missing), fmtPct(x.missing_share, 1)])} /></div>
          </div>
        </Panel>
        <Panel title="Import history and validation errors" variant="secondary" motif="verify">
          {d.is_demo && d.imports.length === 0 ? <p className="text-sm text-ink-2">Generated by the IRIS demo setup; it was not imported from a file.</p> : <ImportHistory rows={d.imports} />}
        </Panel>
      </div>
      <Dialog open={del} onOpenChange={setDel}>
        <DialogContent title={`Delete ${d.name}?`} description="Its records are removed from the prototype database. The import history entry is kept."
          footer={<><Button variant="secondary" onClick={() => setDel(false)}>Cancel</Button><Button variant="danger" onClick={() => m.mutate()} disabled={m.isPending}>Delete dataset</Button></>}>
          <InlineError error={m.error} />
        </DialogContent>
      </Dialog>
    </>
  );
}
