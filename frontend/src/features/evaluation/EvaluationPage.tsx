import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard } from "@/components/data-display/MetricCard";
import { metricChange, validExperiment } from "@/lib/decision-support";
import { useEffect, useState } from "react";
import { ProportionBar } from "@/components/data-display/charts";
import { PageHeader } from "@/components/data-display/PageHeader";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { KeyValue, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, InlineError, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/useToast";
import { fmtDateTime, fmtNum, fmtPct, fmtSigned } from "@/lib/format";
import { api } from "@/services/api";
import type { Experiment, Method } from "@/types/api";

const METHODS: Method[] = ["threshold", "ewma", "network"];
const DESCRIPTIONS: Record<Method, string> = {
  threshold: "Compares each week's share of late or missing reports with the unit's own recent median and spread.",
  ewma: "Smooths the same signal over time (exponentially weighted moving average) to catch sustained shifts.",
  network: "Threshold evidence plus support from connected units (same hub or shared resource) delayed in the same week.",
};

const percent = (value: number | null | undefined, digits = 1) => value == null ? "Unavailable" : fmtPct(value, digits);
const score = (value: number | null | undefined) => value == null ? "Unavailable" : fmtNum(value, 3);

function MethodTable({ r }: { r: Experiment["results"] }) {
  const rows: { label: string; hint: string; get: (m: Method) => string }[] = [
    { label: "Precision", hint: "higher is better", get: (m) => percent(r.methods[m].overall.precision) },
    { label: "Recall", hint: "higher is better", get: (m) => percent(r.methods[m].overall.recall) },
    { label: "False-alarm rate", hint: "lower is better", get: (m) => percent(r.methods[m].overall.false_alarm_rate, 2) },
    { label: "F1 score", hint: "higher is better", get: (m) => score(r.methods[m].overall.f1) },
    { label: "Events detected", hint: "unit-level disruption episodes", get: (m) => percent(r.methods[m].event_detection_rate) },
    { label: "Median detection delay", hint: "weeks after start; lower is better", get: (m) => (r.methods[m].median_delay_weeks === null ? "—" : `${fmtNum(r.methods[m].median_delay_weeks, 1)} wk`) },
    { label: "Mean detection delay", hint: "weeks, detected events only", get: (m) => (r.methods[m].mean_delay_weeks === null ? "—" : `${fmtNum(r.methods[m].mean_delay_weeks, 2)} wk`) },
    { label: "True / false positives", hint: "unit-weeks", get: (m) => `${fmtNum(r.methods[m].overall.tp)} / ${fmtNum(r.methods[m].overall.fp)}` },
  ];
  return (
    <div className="overflow-x-auto" role="region" aria-label="Evaluation result table" tabIndex={0}>
      <table className="w-full min-w-[36rem] text-sm">
        <caption className="sr-only">Method comparison</caption>
        <thead className="bg-porcelain text-left text-xs text-ink-2"><tr><th scope="col" className="px-3 py-2 font-semibold">Metric</th>{METHODS.map((m) => <th key={m} scope="col" className="px-3 py-2 text-right font-semibold">{r.methods[m].label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => (
          <tr key={row.label} className="border-t border-line"><th scope="row" className="px-3 py-2 text-left font-medium">{row.label}<span className="block text-xs font-normal text-ink-2">{row.hint}</span></th>
            {METHODS.map((m) => <td key={m} className="px-3 py-2 text-right tabular">{row.get(m)}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function ByTable({ head, rows }: { head: string; rows: { label: string; n: number; values: (number | null)[] }[] }) {
  return (
    <div className="overflow-x-auto" role="region" aria-label="Evaluation result table" tabIndex={0}>
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="bg-porcelain text-left text-xs text-ink-2"><tr><th scope="col" className="px-3 py-2 font-semibold">{head}</th><th scope="col" className="px-3 py-2 text-right font-semibold">Unit-weeks</th>{METHODS.map((m) => <th key={m} scope="col" className="px-3 py-2 font-semibold">{m === "threshold" ? "Statistical threshold" : m === "ewma" ? "Time-series (EWMA)" : "Network-aware"}</th>)}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.label} className="border-t border-line"><th scope="row" className="px-3 py-2 text-left font-medium">{r.label}</th><td className="px-3 py-2 text-right tabular">{fmtNum(r.n)}</td>
            {r.values.map((v, i) => <td key={i} className="px-3 py-2"><ProportionBar value={v} /></td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Results({ e }: { e: Experiment }) {
  const r = e.results;
  const net = r.network_effect;
  const shared = r.methods.network.shared_identification;
  const [method, setMethod] = useState<Method>("network");
  const metrics = r.methods[method].overall;
  const sentence = `Network-aware compared with statistical threshold: precision ${metricChange(net.precision_change)} (${net.precision_change == null ? "not available" : fmtSigned(net.precision_change)}), recall ${metricChange(net.recall_change)} (${net.recall_change == null ? "not available" : fmtSigned(net.recall_change)}), false-alarm rate ${metricChange(net.false_alarm_rate_change)} (${net.false_alarm_rate_change == null ? "not available" : fmtSigned(net.false_alarm_rate_change)}). Differences are percentage points.`;
  const chart = METHODS.map((m) => ({ method: r.methods[m].label, precision: r.methods[m].overall.precision, recall: r.methods[m].overall.recall }));
  return (
    <div className="iris-workspace-stack">
      <Panel className="iris-decision-hero iris-evaluation-hero" motif="trends" bodyClassName="p-6 lg:p-8">
        <p className="iris-eyebrow mb-3">Synthetic labeled reporting disruptions</p>
        <h2 className="text-2xl font-semibold">{e.name}</h2>
        <p className="mt-3 max-w-2xl text-sm">All three implemented detection methods use identical simulated inputs and known disruption labels. These results are not validation against real surveillance operations.</p>
        <p className="mt-4 text-xs text-ink-2">{e.id} | {r.config.replications} replications | base seed {r.config.base_seed} | {r.config.n_weeks} reporting weeks per replication | {fmtNum(r.unit_weeks_per_method)} unit-weeks per method.</p>
      </Panel>
      <div className="iris-toolbar">
        <p className="text-xs text-ink-2">The four numbers below are for the method chosen here, in this simulated test.</p>
        <div className="w-full sm:w-64"><label htmlFor="metric-method" className="mb-1 block text-xs text-ink-2">Metric card method</label><Select id="metric-method" value={method} onChange={(event) => setMethod(event.target.value as Method)}>{METHODS.map((m) => <option key={m} value={m}>{r.methods[m].label}</option>)}</Select></div>
      </div>
      <div className="iris-phase4-metrics grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Precision" value={percent(metrics.precision)} detail={`${fmtNum(metrics.tp)} true positives / ${fmtNum(metrics.tp + metrics.fp)} flagged unit-weeks.`} motif="verify" />
        <MetricCard label="Recall" value={percent(metrics.recall)} detail={`${fmtNum(metrics.tp)} detected / ${fmtNum(metrics.tp + metrics.fn)} disrupted unit-weeks.`} motif="trends" />
        <MetricCard label="F1 score" value={score(metrics.f1)} detail="Balance of precision and recall (0 to 1)." motif="network" />
        <MetricCard label="False-alarm rate" value={percent(metrics.false_alarm_rate, 2)} detail={`${fmtNum(metrics.fp)} false flags / ${fmtNum(metrics.fp + metrics.tn)} normal unit-weeks.`} motif="records" />
      </div>
      <Panel title="Detection method comparison" description="Simulated test: the same synthetic data and known disruptions for every method. Higher is better for both. A method with no value is left out of the bars and shown as — in the table." motif="trends">
        <figure aria-label="Detection precision and recall comparison">
          <ul className="mb-3 flex flex-wrap gap-4 text-xs text-ink-2" aria-label="Legend"><li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--iris-chart-1)]" aria-hidden />Precision (share of flags that were real disruptions)</li><li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border-2 border-[var(--iris-chart-2)] bg-[var(--iris-chart-2)]/25" aria-hidden />Recall (share of disruptions flagged)</li></ul>
          <div className="h-72" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} layout="vertical" margin={{ left: 4, right: 18 }}>
            <CartesianGrid stroke="var(--iris-chart-grid)" horizontal={false} />
            <XAxis type="number" domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fill: "var(--iris-chart-axis)", fontSize: 11 }} />
            <YAxis type="category" dataKey="method" width={115} tick={{ fill: "var(--iris-chart-axis)", fontSize: 11 }} />
            <Tooltip formatter={(value) => percent(value == null ? null : Number(value))} contentStyle={{ background: "var(--iris-surface-solid)", border: "1px solid var(--iris-chart-grid)", color: "var(--color-ink)" }} />
            <Bar isAnimationActive={false} dataKey="precision" name="Precision" fill="var(--iris-chart-1)" barSize={15} />
            <Bar isAnimationActive={false} dataKey="recall" name="Recall" fill="var(--iris-chart-2)" fillOpacity={0.25} stroke="var(--iris-chart-2)" strokeWidth={2} barSize={15} />
          </BarChart></ResponsiveContainer></div>
          <figcaption className="mt-2 text-xs text-ink-2">Accessible numerical comparison follows. These methods are statistical detectors, not trained predictive models.</figcaption>
        </figure>
        <MethodTable r={r} />
      </Panel>
      <details className="group rounded-md border border-line bg-white">
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 text-[15px] font-semibold text-teal-900 [&::-webkit-details-marker]:hidden">About this test run</summary>
        <div className="border-t border-line p-4">
        <KeyValue columns={3} items={[
          { label: "Run", value: `${e.id} · ${e.name}` },
          { label: "Executed", value: `${fmtDateTime(e.created_at)} by ${e.created_by}` },
          { label: "Replications × seed", value: `${r.config.replications} × base seed ${r.config.base_seed}` },
          { label: "Unit-weeks per method", value: fmtNum(r.unit_weeks_per_method) },
          { label: "Disrupted unit-weeks (ground truth)", value: fmtNum(r.positives) },
          { label: "Compute time", value: `${r.elapsed_seconds} s` },
        ]} />
        <p className="mt-3 text-[13px] text-ink-2">{r.scenario_mix} All methods were run on identical simulated data. Metrics are computed from this run only.</p>
        </div>
      </details>
      <Panel title="Detection method definitions" description="Each unit-week counts once. A week is a labeled disruption only if the simulation injected one; holiday delays and real outbreaks are not.">
        <ul className="mt-3 flex flex-col gap-1 text-[13px] text-ink-2">{METHODS.map((m) => <li key={m}><span className="font-medium text-ink">{r.methods[m].label}:</span> {DESCRIPTIONS[m]}</li>)}</ul>
      </Panel>
      <details className="group rounded-md border border-line bg-white">
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 text-[15px] font-semibold text-teal-900 [&::-webkit-details-marker]:hidden">More results</summary>
        <div className="flex flex-col gap-5 border-t border-line p-4">
      <Panel title="With and without network information" description="Network-aware versus statistical threshold, which uses the same unit-level evidence without connections.">
        <p className="text-sm text-ink">{sentence}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <thead className="text-left text-xs text-ink-2"><tr><th scope="col" className="py-1.5 font-semibold">Scenario type</th><th scope="col" className="py-1.5 text-right font-semibold">Recall change from network information</th></tr></thead>
            <tbody>{net.by_kind.map((k) => <tr key={k.kind} className="border-t border-line"><th scope="row" className="py-1.5 text-left font-medium">{k.label}</th><td className="py-1.5 text-right tabular">{fmtSigned(k.recall_change)}</td></tr>)}</tbody>
          </table>
        </div>
        {shared && (
          <p className="mt-3 text-sm text-ink">
            Of {fmtNum(shared.shared_detections)} detected unit-weeks in shared disruptions, {percent(shared.shared_labelled_shared)} had enough connected-unit support to be presented as a possible shared problem.
            Of {fmtNum(shared.isolated_detections)} detected isolated-unit problems, {percent(shared.isolated_labelled_shared)} were also labelled as shared (a misattribution). The other two methods cannot attribute shared causes.
          </p>
        )}
      </Panel>
      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
        <Panel title="Recall by scenario type">
          <ByTable head="Scenario type" rows={r.methods.threshold.by_kind.map((k, i) => ({ label: k.label, n: k.unit_weeks, values: METHODS.map((m) => r.methods[m].by_kind[i].recall) }))} />
          <p className="mt-2 text-xs text-ink-2">Incomplete-record and count-drop checks are shared by all methods, so differences there come only from the reporting-delay logic.</p>
        </Panel>
        <Panel title="Recall by severity">
          <ByTable head="Severity" rows={r.methods.threshold.by_severity.map((s, i) => ({ label: s.severity[0].toUpperCase() + s.severity.slice(1), n: s.unit_weeks, values: METHODS.map((m) => r.methods[m].by_severity[i].recall) }))} />
        </Panel>
      </div>
      <Panel title="Where false alarms came from" description="Flags on unit-weeks without an injected disruption.">
        <div className="overflow-x-auto" role="region" aria-label="Evaluation result table" tabIndex={0}>
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-porcelain text-left text-xs text-ink-2"><tr><th scope="col" className="px-3 py-2 font-semibold">Context</th>{METHODS.map((m) => <th key={m} scope="col" className="px-3 py-2 text-right font-semibold">{r.methods[m].label}</th>)}</tr></thead>
            <tbody>{([["background", "Ordinary random variation"], ["holiday", "Holiday-week delay"], ["outbreak", "During or after a genuine case increase"], ["after_disruption", "Within two weeks after a disruption ended"]] as const).map(([k, l]) => (
              <tr key={k} className="border-t border-line"><th scope="row" className="px-3 py-2 text-left font-medium">{l}</th>{METHODS.map((m) => <td key={m} className="px-3 py-2 text-right tabular">{fmtNum(r.methods[m].false_alarm_context[k])}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Detection settings used in this run"><KeyValue columns={3} items={Object.entries(r.params).map(([k, v]) => ({ label: k.replace(/_/g, " "), value: String(v) }))} /></Panel>
        </div>
      </details>
    </div>
  );
}

export function EvaluationPage() {
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ["experiments"], queryFn: api.experiments });
  const [sel, setSel] = useState<string>("");
  const [form, setForm] = useState({ replications: 20, base_seed: 7100, name: "" });
  useEffect(() => { if (!sel && list.data?.length) setSel(list.data[0].id); }, [list.data, sel]);
  const exp = useQuery({ queryKey: ["experiment", sel], queryFn: () => api.experiment(sel), enabled: !!sel });
  const run = useMutation({ mutationFn: () => api.runExperiment(form), onSuccess: (e) => { qc.invalidateQueries({ queryKey: ["experiments"] }); qc.setQueryData(["experiment", e.id], e); setSel(e.id); toast(`Test ${e.id} finished in ${e.results.elapsed_seconds} s.`); } });
  const invalid = !validExperiment(form.replications, form.base_seed);
  return (
    <>
      <PageHeader title="Evaluation Lab" description="Evaluate reporting-disruption detection performance using reproducible experiments." />
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel title="Stored experiment" variant="secondary" motif="records">
            {list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data ? <Loading /> : list.data.length === 0 ? <EmptyState title="Not evaluated yet">No test has been run yet.</EmptyState> : (
              <Field label="Showing">{(p) => <Select {...p} disabled={run.isPending} value={sel} onChange={(e) => setSel(e.target.value)}>{list.data.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.name} · {fmtDateTime(x.created_at)}{x.status === "failed" ? " (failed)" : ""}</option>)}</Select>}</Field>
            )}
          </Panel>
          {can("experiment.run") && (
            <Panel title="Experiment configuration" variant="secondary" motif="network"><details><summary className="min-h-11 cursor-pointer text-sm font-semibold">Configure and run evaluation</summary>
              <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (!invalid && !run.isPending) run.mutate(); }}>
                <fieldset disabled={run.isPending} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Number of runs" hint="3–60" error={!Number.isInteger(form.replications) || form.replications < 3 || form.replications > 60 ? "Choose an integer between 3 and 60." : undefined}>{(p) => <Input {...p} type="number" min={3} max={60} step={1} value={Number.isNaN(form.replications) ? "" : form.replications} onChange={(e) => setForm({ ...form, replications: e.target.valueAsNumber })} />}</Field>
                  <Field label="Base seed" hint="Integer 0 to 10,000,000; same configuration reproduces metrics." error={!Number.isInteger(form.base_seed) || form.base_seed < 0 || form.base_seed > 10_000_000 ? "Enter an integer seed from 0 to 10,000,000." : undefined}>{(p) => <Input {...p} type="number" min={0} max={10_000_000} step={1} value={Number.isNaN(form.base_seed) ? "" : form.base_seed} onChange={(e) => setForm({ ...form, base_seed: e.target.valueAsNumber })} />}</Field>
                </fieldset>
                <p className="text-xs text-ink-2">Every run evaluates threshold, ewma and network on the same generated data. Only replication count and seed are configurable.</p>
                <Field label="Name" optional>{(p) => <Input {...p} maxLength={200} disabled={run.isPending} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
                <InlineError error={run.error} />
                <div><Button type="submit" disabled={run.isPending || invalid}>{run.isPending ? "Running…" : "Run evaluation"}</Button></div>
              </form>
              {run.isPending && <p role="status" className="mt-3 text-sm text-ink-2">Evaluating synthetic replications. Results will appear after the server completes this run.</p>}
              </details>
            </Panel>
          )}
        </div>
        {sel && (exp.error ? <ErrorState error={exp.error} onRetry={() => exp.refetch()} /> : !exp.data ? <Loading label="Loading results" /> : exp.data.status === "failed" ? <ErrorState error={new Error(exp.data.error ?? "Failed")} title="This evaluation failed" /> : <Results e={exp.data} />)}
      </div>
    </>
  );
}
