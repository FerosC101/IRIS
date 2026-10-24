import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/data-display/PageHeader";
import { TrendChart } from "@/components/data-display/charts";
import { SeverityBadge, ConcernStatusBadge, VerificationBadge } from "@/components/data-display/badges";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Panel, KeyValue } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { fmtPeriod } from "@/lib/format";
import { api } from "@/services/api";
import { RunDetection } from "./InvestigationsPage";
import { EvidenceList } from "./EvidenceSections";

export function AnomalyPage() {
  const { meta, can } = useSession();
  const [unit, setUnit] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState("");
  const findings = useQuery({ queryKey: ["concerns", "analysis", unit, page], queryFn: () => api.concerns({ status: "active", unit_id: unit, page, page_size: 5, sort: "severity", order: "asc" }) });
  const selected = findings.data?.rows.find((r) => r.id === picked)?.id ?? findings.data?.rows[0]?.id;
  const detail = useQuery({ queryKey: ["concern", selected], queryFn: () => api.concern(selected!), enabled: !!selected });
  const history = useQuery({ queryKey: ["unit", unit], queryFn: () => api.unit(unit), enabled: !!unit });
  const overview = useQuery({ queryKey: ["overview", "all", "active"], queryFn: () => api.overview({ period: "all", status: "active" }), enabled: !unit });
  const signal = unit ? history : overview;
  const data = unit ? history.data?.history : overview.data?.trend;
  const c = detail.data?.concern;
  return <>
    <PageHeader title="Anomaly Analysis" description="Detect suspicious reporting patterns and examine supporting evidence." />
    <div className="iris-workspace-stack">
      <div className="iris-toolbar">
        <div><p className="iris-eyebrow">{meta?.demo_dataset_id ?? "Dataset unavailable"}</p><p className="mt-1 text-xs text-ink-2">Synthetic reporting dataset. Detection scans the whole dataset; the list below shows flags in your reporting scope.</p></div>
        {can("detection.run") && <RunDetection />}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel title="Reporting completeness and timeliness" description={unit ? "Observed for the selected unit, all available weeks. Completeness = reports received ÷ expected; timeliness = received by the due date ÷ expected." : "Observed across your reporting scope, latest 12 weeks. Completeness = reports received ÷ expected; timeliness = received by the due date ÷ expected."} motif="trends">
          <label htmlFor="analysis-unit" className="mb-1 block text-xs text-ink-2">Reporting unit (chart and list)</label>
          <Select id="analysis-unit" value={unit} onChange={(e) => { setUnit(e.target.value); setPage(1); setPicked(""); }}><option value="">Reporting scope overview</option>{meta?.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
          <p className="my-3 text-xs text-ink-2">Choosing a unit does not change what detection scans. Weeks with no data are left as gaps, not drawn as zero.</p>
          {signal.error ? <ErrorState error={signal.error} onRetry={() => signal.refetch()} /> : !data ? <Loading label="Loading reporting signal" /> : data.length ? <TrendChart title="Reporting completeness and timeliness by week" data={data} xKey="period_start" series={[{ key: "completeness", label: "Completeness" }, { key: "timeliness", label: "Timeliness" }]} height={310} /> : <EmptyState title="Reporting history unavailable" />}
        </Panel>
        <Panel title="How flags are raised" variant="secondary" motif="network">
          <ul className="flex flex-col gap-4">{meta && Object.entries(meta.labels.method).map(([id, label]) => <li key={id}><h3 className="text-sm font-semibold">{label}</h3><p className="mt-1 text-xs text-ink-2">{id === "threshold" ? "Robust historical threshold comparison." : id === "ewma" ? "Exponentially weighted reporting signal." : "Reporting signal with connected-peer support."}</p></li>)}</ul>
          <p className="mt-4 border-t border-line pt-3 text-xs text-ink-2">A flag is a prompt for review, not a confirmed problem. A shared connection is a possible explanation, never a proven cause; a person verifies each one.</p>
        </Panel>
        <Panel title="Flagged for review" description="Open concerns, highest priority first. Select one to see its evidence." motif="records" bodyClassName="p-0">
          {findings.error ? <div className="p-4"><ErrorState error={findings.error} onRetry={() => findings.refetch()} /></div> : !findings.data ? <Loading /> : !findings.data.rows.length ? <EmptyState title="No open flags for this selection" /> : <>
            <ul className="divide-y divide-line">{findings.data.rows.map((r) => <li key={r.id}><button type="button" aria-pressed={selected === r.id} onClick={() => setPicked(r.id)} className={`iris-finding w-full p-4 text-left ${selected === r.id ? "iris-finding-selected" : ""}`}><span className="flex flex-wrap items-center gap-2"><SeverityBadge severity={r.severity} /><span className="text-xs text-ink-2">{r.id}</span></span><span className="mt-2 block text-sm font-semibold">{r.title}</span><span className="mt-1 block text-xs text-ink-2">{r.units_label} | {fmtPeriod(r.period_start, r.period_end)}</span></button></li>)}</ul>
            <div className="flex items-center justify-between gap-2 border-t border-line p-3"><Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-xs">Page {page} of {Math.max(1, findings.data.pages)}</span><Button variant="ghost" size="sm" disabled={page >= findings.data.pages} onClick={() => setPage(page + 1)}>Next</Button></div>
          </>}
        </Panel>
        <Panel title="Supporting evidence" motif="verify">
          {!selected ? <EmptyState title="Select a flag to see its evidence" /> : detail.error ? <ErrorState error={detail.error} onRetry={() => detail.refetch()} /> : !detail.data || !c ? <Loading label="Loading evidence" /> : <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2"><ConcernStatusBadge status={c.status} /><SeverityBadge severity={c.severity} /></div>
            <h3 className="text-base font-semibold">{c.title}</h3>
            <KeyValue items={[{ label: "Method", value: c.detection_method_label }, { label: "Period", value: fmtPeriod(c.period_start, c.period_end) }, { label: "Shared dependency", value: detail.data.via_label ?? "Not identified" }, { label: "Verification", value: <VerificationBadge verification={c.verification} /> }]} />
            <EvidenceList items={detail.data.evidence.filter((e) => e.kind === "observed").slice(0, 3)} />
            <p className="text-xs text-ink-2">{c.uncertainty_note}</p>
            <Link className="iris-button iris-button-primary inline-flex min-h-11 items-center justify-center px-4 text-sm font-semibold" to={`/investigations/${c.id}`}>Review investigation</Link>
          </div>}
        </Panel>
      </div>
    </div>
  </>;
}
