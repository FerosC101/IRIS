import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DesignationBadge, SlotStatusBadge } from "@/components/data-display/badges";
import { SimpleTable, TrendChart } from "@/components/data-display/charts";
import { DataTable, type SortState } from "@/components/data-display/DataTable";
import { FilterBar, FilterField } from "@/components/data-display/FilterBar";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Input, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { KeyValue, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { useSession } from "@/hooks/useSession";
import { fmtDate, fmtDateTime, fmtNum, fmtPct, fmtPeriod } from "@/lib/format";
import { SLOT_STATUS, VALUE_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { Dataset, FilterOptions, RecordRow } from "@/types/api";
import { RecordSheet } from "./RecordSheet";

type Filters = { search: string; province: string; unit_id: string; category: string; status: string; date_from: string; date_to: string };
const EMPTY: Filters = { search: "", province: "", unit_id: "", category: "", status: "", date_from: "", date_to: "" };

function Filters({ f, set, opts, reset, rhu }: { f: Filters; set: (p: Partial<Filters>) => void; opts: FilterOptions; reset: () => void; rhu: boolean }) {
  const { categoryName } = useSession();
  const active = Object.values(f).filter(Boolean).length;
  return (
    <FilterBar activeCount={active - (f.search ? 1 : 0)} onReset={reset} label="Filters"
      primary={<div className="w-full md:w-72"><label htmlFor="ds-search" className="sr-only">Search records</label><Input id="ds-search" type="search" value={f.search} placeholder="Search unit, area or category" onChange={(e) => set({ search: e.target.value })} /></div>}>
      {opts.provinces.length > 0 && !rhu && (
        <FilterField label="Province / area">{(id) => <Select id={id} value={f.province} onChange={(e) => set({ province: e.target.value })}><option value="">All</option>{opts.provinces.map((p) => <option key={p}>{p}</option>)}</Select>}</FilterField>
      )}
      {opts.has_units && opts.units.length > 0 && !rhu && (
        <FilterField label="Reporting unit" className="w-full md:w-52">{(id) => <Select id={id} value={f.unit_id} onChange={(e) => set({ unit_id: e.target.value })}><option value="">All units</option>{opts.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>}</FilterField>
      )}
      <FilterField label="Category">{(id) => <Select id={id} value={f.category} onChange={(e) => set({ category: e.target.value })}><option value="">All categories</option>{opts.categories.map((c) => <option key={c} value={c}>{categoryName(c)}</option>)}</Select>}</FilterField>
      <FilterField label="Status">
        {(id) => (
          <Select id={id} value={f.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Any</option>
            {opts.statuses.length > 0 && <optgroup label="Submission">{opts.statuses.map((s) => <option key={s} value={s}>{SLOT_STATUS[s as keyof typeof SLOT_STATUS]?.label ?? s}</option>)}</optgroup>}
            <optgroup label="Value">{opts.value_statuses.map((s) => <option key={s} value={s}>{VALUE_STATUS[s as keyof typeof VALUE_STATUS].label}</option>)}</optgroup>
          </Select>
        )}
      </FilterField>
      <FilterField label="Period from" className="w-full md:w-40">{(id) => <Input id={id} type="date" value={f.date_from} min={opts.date_min ?? undefined} max={opts.date_max ?? undefined} onChange={(e) => set({ date_from: e.target.value })} />}</FilterField>
      <FilterField label="Period to" className="w-full md:w-40">{(id) => <Input id={id} type="date" value={f.date_to} min={opts.date_min ?? undefined} max={opts.date_max ?? undefined} onChange={(e) => set({ date_to: e.target.value })} />}</FilterField>
    </FilterBar>
  );
}

function ValueCell({ r }: { r: RecordRow }) {
  if (r.status === "not_received") return <span className="text-ink-2 italic">Not received</span>;
  if (r.value_status === "blank") return <span className="text-attention-ink">Blank</span>;
  if (r.value_status === "zero") return <span>0 <span className="text-xs text-ink-2">(zero report)</span></span>;
  return <span className="tabular">{fmtNum(r.value)}</span>;
}

function RecordsTab({ ds, f }: { ds: Dataset; f: Filters }) {
  const { categoryName } = useSession();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ key: "period_start", order: "desc" });
  const [row, setRow] = useState<RecordRow | null>(null);
  useEffect(() => setPage(1), [f, ds.id]);
  const params = { ...f, page, page_size: 25, sort: sort.key, order: sort.order };
  const q = useQuery({ queryKey: ["records", ds.id, params], queryFn: () => api.records(ds.id, params), placeholderData: (p) => p });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loading />;
  return (
    <>
      {ds.has_expectations && <p className="mb-3 text-[13px] text-ink-2">Reports that were expected but never arrived are listed too, marked “Not received”.</p>}
      <div className="rounded-md border border-line bg-white">
        <div className="px-4 md:px-0">
          <DataTable<RecordRow>
            caption="Records"
            rows={q.data.rows}
            rowKey={(r) => `${r.record_id ?? "x"}-${r.unit_id}-${r.category_code}-${r.period_start}-${r.area}`}
            onRowClick={setRow}
            sort={sort}
            onSort={(s) => { setSort(s); setPage(1); }}
            mobileTitle={(r) => `${r.unit_name ?? r.area ?? "—"} · ${categoryName(r.category_code)}`}
            emptyState={<div className="p-4"><EmptyState title="No records match these filters" /></div>}
            columns={[
              { key: "unit", header: ds.has_units || ds.has_expectations ? "Reporting unit" : "Area", sortKey: ds.has_units || ds.has_expectations ? "unit_name" : "area", hideOnMobile: true,
                cell: (r) => <button type="button" className="text-left font-medium text-teal-900 hover:underline" onClick={() => setRow(r)}>{r.unit_name ?? r.area ?? "—"}</button> },
              { key: "category", header: "Category", sortKey: "category_code", hideOnMobile: true, cell: (r) => categoryName(r.category_code) },
              { key: "period", header: "Period", sortKey: "period_start", className: "whitespace-nowrap", cell: (r) => fmtPeriod(r.period_start, r.period_end) },
              { key: "value", header: "Value", sortKey: "value", align: "right", cell: (r) => <ValueCell r={r} /> },
              { key: "status", header: "Submission", sortKey: "status", cell: (r) => (r.status === "received" ? <span className="text-ink-2">No timestamps</span> : <SlotStatusBadge status={r.status} />) },
              { key: "received", header: "Received", sortKey: "received_at", className: "whitespace-nowrap", cell: (r) => fmtDateTime(r.received_at) },
              { key: "late", header: "Days late", sortKey: "days_late", align: "right", cell: (r) => (r.days_late ? fmtNum(r.days_late, 1) : "—") },
            ]}
          />
        </div>
        <div className="border-t border-line px-4 py-3"><Pagination page={q.data.page} pages={q.data.pages} total={q.data.total} pageSize={q.data.page_size} onPage={setPage} /></div>
      </div>
      <RecordSheet datasetId={ds.id} row={row} onClose={() => setRow(null)} />
    </>
  );
}

function TrendsTab({ ds, f }: { ds: Dataset; f: Filters }) {
  const { categoryName } = useSession();
  const [variable, setVariable] = useState("cases");
  const [group, setGroup] = useState("category");
  const q = useQuery({ queryKey: ["trends", ds.id, variable, group, f], queryFn: () => api.trends(ds.id, { ...f, variable, group_by: group }) });
  const max = useMemo(() => {
    if (!q.data || variable !== "cases") return undefined;
    let m = 0;
    for (const row of q.data.series) for (const g of q.data.groups) { const v = row[g]; if (typeof v === "number" && v > m) m = v; }
    if (m <= 0) return 1;
    const step = 10 ** Math.floor(Math.log10(m)) / 2;
    return Math.ceil((m * 1.05) / step) * step;
  }, [q.data, variable]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-56"><label htmlFor="tv" className="mb-1 block text-xs font-medium text-ink-2">Variable</label>
          <Select id="tv" value={variable} onChange={(e) => setVariable(e.target.value)}>
            <option value="cases">Reported cases (sum)</option>
            <option value="completeness">Completeness (received ÷ expected)</option>
            <option value="timeliness">Timeliness (on time ÷ expected)</option>
          </Select></div>
        <div className="sm:w-48"><label htmlFor="tg" className="mb-1 block text-xs font-medium text-ink-2">One chart per</label>
          <Select id="tg" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="category">Category</option><option value="province">Province / area</option><option value="none">All combined</option>
          </Select></div>
      </div>
      {q.error ? <ErrorState error={q.error} /> : !q.data ? <Loading /> : !q.data.available ? <EmptyState title="Not calculable from this dataset">{q.data.message}</EmptyState> : q.data.series.length === 0 ? <EmptyState title="No data for these filters" /> : (
        <>
          {q.data.note && <p className="text-[13px] text-ink-2">{q.data.note}</p>}
          <p className="text-[13px] text-ink-2">Small multiples share the same vertical scale so groups can be compared.</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {q.data.groups.map((g) => (
              <Panel key={g} title={group === "category" ? categoryName(g) : g} className="min-w-0">
                <TrendChart title={`${variable} for ${g}`} data={q.data!.series} xKey="period_start" series={[{ key: g, label: categoryName(g) }]} percent={variable !== "cases"} yMax={max} height={170} />
              </Panel>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function QualityTab({ ds, f }: { ds: Dataset; f: Filters }) {
  const q = useQuery({ queryKey: ["quality", ds.id, f], queryFn: () => api.quality(ds.id, f) });
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Loading />;
  const d = q.data;
  const received = d.value_status.reported + d.value_status.zero + d.value_status.blank;
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Missing values versus confirmed zeros" description={d.notes[0]}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <caption className="sr-only">Value status counts</caption>
            <thead className="text-left text-xs text-ink-2"><tr><th scope="col" className="py-1.5 font-semibold">Status</th><th scope="col" className="py-1.5 text-right font-semibold">Count</th><th scope="col" className="py-1.5 pl-4 font-semibold">Meaning</th></tr></thead>
            <tbody>
              {d.expected_available && <tr className="border-t border-line"><th scope="row" className="py-1.5 text-left font-medium">Not received</th><td className="py-1.5 text-right tabular">{fmtNum(d.not_received)}</td><td className="py-1.5 pl-4 text-ink-2">Expected report did not arrive</td></tr>}
              {(["reported", "zero", "blank"] as const).map((k) => (
                <tr key={k} className="border-t border-line"><th scope="row" className="py-1.5 text-left font-medium">{VALUE_STATUS[k].label}</th><td className="py-1.5 text-right tabular">{fmtNum(d.value_status[k])}</td><td className="py-1.5 pl-4 text-ink-2">{VALUE_STATUS[k].help}</td></tr>
              ))}
              {d.expected_available && <tr className="border-t border-line"><th scope="row" className="py-1.5 text-left font-medium">Late</th><td className="py-1.5 text-right tabular">{fmtNum(d.late)}</td><td className="py-1.5 pl-4 text-ink-2">Received after the due date</td></tr>}
              <tr className="border-t border-line"><th scope="row" className="py-1.5 text-left font-medium">Duplicate records</th><td className="py-1.5 text-right tabular">{fmtNum(d.duplicates)}</td><td className="py-1.5 pl-4 text-ink-2">Same unit/area, category and period (whole dataset)</td></tr>
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Field missingness" description={`Among ${fmtNum(received)} received records.`}>
        <div className="overflow-x-auto">
          <SimpleTable head={["Field", "Missing", "Share missing"]} rows={d.fields.map((x) => [x.label, fmtNum(x.missing), fmtPct(x.missing_share, 1)])} />
        </div>
      </Panel>
      {d.per_unit.length > 0 && (
        <Panel title="By reporting unit" description="Sorted by not-received plus blank values." bodyClassName="p-0">
          <div className="px-4 md:px-0">
            <DataTable caption="Data quality by unit" rows={d.per_unit} rowKey={(r) => r.unit_id} mobileTitle={(r) => r.unit_name} minWidth={640}
              columns={[
                { key: "u", header: "Unit", hideOnMobile: true, cell: (r) => r.unit_name },
                { key: "e", header: "Expected", align: "right", cell: (r) => r.expected },
                { key: "n", header: "Not received", align: "right", cell: (r) => <span className={cn(r.not_received > 0 && "font-medium text-critical-ink")}>{r.not_received}</span> },
                { key: "l", header: "Late", align: "right", cell: (r) => r.late },
                { key: "b", header: "Blank", align: "right", cell: (r) => r.blank },
                { key: "z", header: "Zero reports", align: "right", cell: (r) => r.zero },
                { key: "i", header: "Incomplete forms", align: "right", cell: (r) => r.incomplete_forms },
              ]} />
          </div>
        </Panel>
      )}
    </div>
  );
}

function MetadataTab({ ds }: { ds: Dataset }) {
  const q = useQuery({ queryKey: ["dataset", ds.id], queryFn: () => api.dataset(ds.id) });
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Provenance" actions={<Link to={`/data/datasets/${ds.id}`} className="text-[13px] font-medium text-teal-900 hover:underline">Open in Data Management</Link>}>
        <KeyValue items={[
          { label: "Designation", value: <DesignationBadge designation={ds.designation} /> },
          { label: "Source", value: ds.source },
          { label: "Geographic level", value: ds.geographic_level },
          { label: "Coverage", value: ds.coverage_start ? fmtPeriod(ds.coverage_start, ds.coverage_end) : "—" },
          { label: "Rows", value: fmtNum(ds.row_count) },
          { label: "Imported", value: fmtDateTime(ds.imported_at) },
          { label: "Reporting schedule defined", value: ds.has_expectations ? "Yes — completeness can be calculated" : "No — completeness not calculable" },
          { label: "Due/received timestamps", value: ds.has_timestamps ? "Yes" : "No — timeliness not calculable" },
        ]} />
      </Panel>
      <Panel title="Known limitations">
        <ul className="list-disc space-y-1 pl-5 text-sm">{ds.known_limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </Panel>
      <Panel title="Data dictionary">
        {!q.data ? <Loading /> : <div className="overflow-x-auto"><SimpleTable head={["Field", "Label", "Description"]} rows={q.data.data_dictionary.map((d) => [d.source_column ? `${d.field} ← ${d.source_column}` : d.field, d.label, d.description])} /></div>}
      </Panel>
    </div>
  );
}

export function DataExplorerPage() {
  const { role } = useSession();
  const [params, setParams] = useSearchParams();
  const ds = useQuery({ queryKey: ["datasets"], queryFn: api.datasets });
  const datasetId = params.get("dataset") ?? ds.data?.[0]?.id ?? "";
  const dataset = ds.data?.find((d) => d.id === datasetId);
  const opts = useQuery({ queryKey: ["filters", datasetId], queryFn: () => api.filters(datasetId), enabled: !!datasetId });
  const [f, setFState] = useState<Filters>(EMPTY);
  const [tab, setTab] = useState(params.get("tab") ?? "records");
  const set = (p: Partial<Filters>) => setFState((x) => ({ ...x, ...p }));
  useEffect(() => setFState(EMPTY), [datasetId]);

  return (
    <>
      <ScreenHeader screen="reports" />
      <div className="mt-[25px]" />
      {ds.error ? <ErrorState error={ds.error} onRetry={() => ds.refetch()} /> : !ds.data ? <Loading /> : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-96">
              <label htmlFor="ds" className="mb-1 block text-xs font-medium text-ink-2">Dataset</label>
              <Select id="ds" value={datasetId} onChange={(e) => setParams({ dataset: e.target.value })}>
                {ds.data.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </div>
            {dataset && <div className="flex flex-wrap items-center gap-2 pb-2"><DesignationBadge designation={dataset.designation} /><span className="text-[13px] text-ink-2">{dataset.geographic_level}-level · {fmtNum(dataset.row_count)} rows · {dataset.coverage_start ? `${fmtDate(dataset.coverage_start)} – ${fmtDate(dataset.coverage_end)}` : ""}</span></div>}
          </div>
          {role === "rhu_staff" && <p className="text-[13px] text-ink-2">As RHU staff you see records for your own unit only.</p>}
          {opts.data && <Filters f={f} set={set} opts={opts.data} reset={() => setFState(EMPTY)} rhu={role === "rhu_staff"} />}
          {dataset && (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList label="Data explorer views" tabs={[{ value: "records", label: "Reports" }, { value: "trends", label: "Trends" }, { value: "quality", label: "What's missing" }, { value: "metadata", label: "About this data" }]} />
              <TabsContent value="records"><RecordsTab ds={dataset} f={f} /></TabsContent>
              <TabsContent value="trends"><TrendsTab ds={dataset} f={f} /></TabsContent>
              <TabsContent value="quality"><QualityTab ds={dataset} f={f} /></TabsContent>
              <TabsContent value="metadata"><MetadataTab ds={dataset} /></TabsContent>
            </Tabs>
          )}
        </div>
      )}
    </>
  );
}

