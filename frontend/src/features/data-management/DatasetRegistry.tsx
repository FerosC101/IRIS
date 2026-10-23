import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DesignationBadge } from "@/components/data-display/badges";
import { DataTable } from "@/components/data-display/DataTable";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { KeyValue, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { fmtNum, fmtPeriod } from "@/lib/format";
import { api } from "@/services/api";
import type { Dataset } from "@/types/api";
import { ValidationBadge } from "./DatasetBadges";

function DatasetSummary({ dataset: d }: { dataset: Dataset }) {
  const { categoryName } = useSession();
  const filters = useQuery({ queryKey: ["filters", d.id], queryFn: () => api.filters(d.id) });
  return (
    <Panel variant="metric" title="Selected dataset" motif="records" className="iris-dataset-summary">
      <div className="flex flex-col gap-5">
        <div>
          <p className="iris-eyebrow mb-3">{d.is_demo ? "Demonstration dataset" : "Imported dataset"}</p>
          <h3 className="text-lg font-semibold leading-snug break-words">{d.name}</h3>
          <div className="mt-3 flex flex-wrap gap-2"><DesignationBadge designation={d.designation} /><ValidationBadge status={d.validation_status} /></div>
        </div>
        <KeyValue columns={1} items={[
          { label: "Source", value: d.source || "Not provided" },
          { label: "Records", value: fmtNum(d.row_count) },
          { label: "Coverage", value: d.coverage_start ? fmtPeriod(d.coverage_start, d.coverage_end) : "Not provided" },
          { label: "Geographic level", value: d.geographic_level },
          { label: "Reporting schedule", value: d.has_expectations ? "Defined" : "Not defined" },
          { label: "Categories in dataset", value: filters.error ? "Could not load categories" : !filters.data ? "Loading categories…" : filters.data.categories.length ? filters.data.categories.map(categoryName).join(", ") : "Not provided" },
        ]} />
        {filters.error && <Button variant="secondary" onClick={() => filters.refetch()}>Retry categories</Button>}
        <p className="border-l-2 border-brand-medium pl-3 text-xs leading-relaxed text-ink-2">Origin is recorded as declared. Blank values and explicit zero counts remain distinct; completeness requires a defined reporting schedule.</p>
        <Link to={`/data/datasets/${d.id}`} className={buttonVariants({ variant: "secondary" })}>Inspect dataset <ArrowRight aria-hidden /></Link>
      </div>
    </Panel>
  );
}

export function DatasetRegistry() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["datasets"], queryFn: api.datasets });
  const [search, setSearch] = useState("");
  const [designation, setDesignation] = useState("");
  const [validation, setValidation] = useState("");
  const [selectedId, setSelectedId] = useState("");
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loading label="Loading dataset registry" />;
  const rows = q.data.filter((d) => (!designation || d.designation === designation) && (!validation || d.validation_status === validation) &&
    [d.name, d.id, d.source, d.description].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  const selected = rows.find((d) => d.id === selectedId) ?? rows[0];
  const reset = () => { setSearch(""); setDesignation(""); setValidation(""); };
  return (
    <div className="iris-workspace-stack">
      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_12rem_13rem_auto]">
        <Field label="Search datasets">{(props) => <div className="relative"><Search className="pointer-events-none absolute top-3 left-3 size-4 text-ink-2" aria-hidden /><Input {...props} type="search" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, source or dataset ID" /></div>}</Field>
        <Field label="Data classification">{(props) => <Select {...props} value={designation} onChange={(e) => setDesignation(e.target.value)}><option value="">All classifications</option><option value="synthetic">Synthetic</option><option value="real">Real observational</option><option value="unknown">Unknown origin</option></Select>}</Field>
        <Field label="Validation status">{(props) => <Select {...props} value={validation} onChange={(e) => setValidation(e.target.value)}><option value="">All statuses</option><option value="valid">Valid</option><option value="valid_with_warnings">Valid with warnings</option><option value="invalid">Invalid</option></Select>}</Field>
        {(search || designation || validation) && <Button variant="ghost" onClick={reset}>Clear filters</Button>}
      </div>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel title="Dataset registry" description={`${fmtNum(rows.length)} of ${fmtNum(q.data.length)} datasets · declared sources and validation metadata.`} motif="records" bodyClassName="p-0" className="iris-records-table">
          <div className="px-4 md:px-0">
            <DataTable<Dataset> caption="Datasets" rows={rows} rowKey={(d) => d.id} onRowClick={(d) => nav(`/data/datasets/${d.id}`)} mobileTitle={(d) => <Link to={`/data/datasets/${d.id}`} className="hover:underline">{d.name}</Link>} minWidth={790}
              emptyState={<div className="p-5"><EmptyState title={q.data.length ? "No datasets match" : "No datasets available"}>{q.data.length ? <Button variant="secondary" onClick={reset}>Clear filters</Button> : "Imported datasets will appear here after confirmation."}</EmptyState></div>}
              columns={[
                { key: "name", header: "Dataset", hideOnMobile: true, className: "min-w-44 max-w-60", cell: (d) => <div><Link to={`/data/datasets/${d.id}`} className="font-semibold text-teal-900 hover:underline">{d.name}</Link><p className="mt-1 text-xs text-ink-2">{d.id}</p></div> },
                { key: "source", header: "Source / level", className: "min-w-36 max-w-52", cell: (d) => <div><p>{d.source || "Not provided"}</p><p className="mt-1 text-xs text-ink-2">{d.geographic_level}</p></div> },
                { key: "designation", header: "Classification", cell: (d) => <DesignationBadge designation={d.designation} /> },
                { key: "coverage", header: "Coverage / records", className: "min-w-40", cell: (d) => <div>{d.coverage_start ? fmtPeriod(d.coverage_start, d.coverage_end) : "Not provided"}<p className="mt-1 text-xs text-ink-2">{fmtNum(d.row_count)} records</p></div> },
                { key: "valid", header: "Validation", cell: (d) => <ValidationBadge status={d.validation_status} /> },
                { key: "actions", header: "Actions", cell: (d) => <Button size="sm" variant="secondary" aria-label={`Preview ${d.name}`} aria-pressed={selected?.id === d.id} onClick={() => setSelectedId(d.id)}>Preview</Button> },
              ]} />
          </div>
          <p className="border-t border-line p-4 text-xs text-ink-2">Select a dataset name for its dictionary, data quality, provenance, and import history. Preview updates the summary alongside this registry.</p>
        </Panel>
        {selected ? <DatasetSummary key={selected.id} dataset={selected} /> : <Panel title="Selected dataset" variant="secondary"><EmptyState title="Choose a dataset">Adjust the registry filters to see available datasets.</EmptyState></Panel>}
      </div>
    </div>
  );
}
