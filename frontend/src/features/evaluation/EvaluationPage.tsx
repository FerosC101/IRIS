import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

function MethodTable({ r }: { r: Experiment["results"] }) {
  const rows: { label: string; hint: string; get: (m: Method) => string }[] = [
    { label: "Precision", hint: "higher is better", get: (m) => fmtPct(r.methods[m].overall.precision, 1) },
    { label: "Recall", hint: "higher is better", get: (m) => fmtPct(r.methods[m].overall.recall, 1) },
    { label: "False-alarm rate", hint: "lower is better", get: (m) => fmtPct(r.methods[m].overall.false_alarm_rate, 2) },
    { label: "F1 score", hint: "higher is better", get: (m) => fmtNum(r.methods[m].overall.f1, 3) },
    { label: "Events detected", hint: "unit-level disruption episodes", get: (m) => fmtPct(r.methods[m].event_detection_rate, 1) },
    { label: "Median detection delay", hint: "weeks after start; lower is better", get: (m) => (r.methods[m].median_delay_weeks === null ? "—" : `${fmtNum(r.methods[m].median_delay_weeks, 1)} wk`) },
    { label: "Mean detection delay", hint: "weeks, detected events only", get: (m) => (r.methods[m].mean_delay_weeks === null ? "—" : `${fmtNum(r.methods[m].mean_delay_weeks, 2)} wk`) },
    { label: "True / false positives", hint: "unit-weeks", get: (m) => `${fmtNum(r.methods[m].overall.tp)} / ${fmtNum(r.methods[m].overall.fp)}` },
  ];
  return (
    <div className="overflow-x-auto">
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
    <div className="overflow-x-auto">
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
  const sentence = (() => {
    const p = net.precision_change ?? 0, rc = net.recall_change ?? 0, fa = net.false_alarm_rate_change ?? 0;
    const dir = (v: number, up: string, down: string) => (Math.abs(v) < 0.0005 ? "did not change" : v > 0 ? up : down);
    return `Compared with the same threshold evidence without connections, adding network information ${dir(p, "raised", "lowered")} precision (${fmtSigned(p)}), ${dir(rc, "raised", "lowered")} recall (${fmtSigned(rc)}) and ${dir(fa, "raised", "lowered")} the false-alarm rate (${fmtSigned(fa)}) in this run.`;
  })();
  const best = (key: "recall" | "precision") => METHODS.reduce((a, b) => ((r.methods[b].overall[key] ?? 0) > (r.methods[a].overall[key] ?? 0) ? b : a));
  const fewest = METHODS.reduce((a, b) => ((r.methods[b].overall.false_alarm_rate ?? 1) < (r.methods[a].overall.false_alarm_rate ?? 1) ? b : a));
  return (
    <div className="flex flex-col gap-5">
      <Panel title="What this test shows">
        <ul className="flex flex-col gap-2 text-[15px] text-ink">
          <li>Catches the most real problems: <strong>{r.methods[best("recall")].label}</strong> (finds {fmtPct(r.methods[best("recall")].overall.recall)} of them).</li>
          <li>Fewest false alarms: <strong>{r.methods[fewest].label}</strong> ({fmtPct(r.methods[fewest].overall.false_alarm_rate, 1)} of normal weeks flagged).</li>
          <li>Most flags turn out to be real: <strong>{r.methods[best("precision")].label}</strong> ({fmtPct(r.methods[best("precision")].overall.precision)} of its flags).</li>
        </ul>
        <p className="mt-3 text-[13px] text-ink-2">Tested on {r.config.replications} simulated runs where the true answer is known. No method is best at everything, and results on real data may differ.</p>
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
      <Panel title="Side by side" description="Each unit-week counts once. A week is a real problem only if the simulation injected one; holiday delays and real outbreaks are not.">
        <MethodTable r={r} />
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
            Of {fmtNum(shared.shared_detections)} detected unit-weeks in shared disruptions, {fmtPct(shared.shared_labelled_shared, 1)} had enough connected-unit support to be presented as a possible shared problem.
            Of {fmtNum(shared.isolated_detections)} detected isolated-unit problems, {fmtPct(shared.isolated_labelled_shared, 1)} were also labelled as shared (a misattribution). The other two methods cannot attribute shared causes.
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
        <div className="overflow-x-auto">
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
  const run = useMutation({ mutationFn: () => api.runExperiment(form), onSuccess: (e) => { qc.invalidateQueries({ queryKey: ["experiments"] }); setSel(e.id); toast(`Test ${e.id} finished in ${e.results.elapsed_seconds} s.`); } });
  const invalid = form.replications < 3 || form.replications > 60 || form.base_seed < 0;
  return (
    <>
      <PageHeader title="Model evaluation" description="How well each way of spotting problems works, tested on simulated data with known answers." />
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel title="Test results">
            {list.error ? <ErrorState error={list.error} /> : !list.data ? <Loading /> : list.data.length === 0 ? <EmptyState title="Not evaluated yet">No test has been run yet.</EmptyState> : (
              <Field label="Showing">{(p) => <Select {...p} value={sel} onChange={(e) => setSel(e.target.value)}>{list.data.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.name} · {fmtDateTime(x.created_at)}{x.status === "failed" ? " (failed)" : ""}</option>)}</Select>}</Field>
            )}
          </Panel>
          {can("experiment.run") && (
            <Panel title="Run a new test" description="Takes about a second per 15 runs.">
              <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (!invalid) run.mutate(); }}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Number of runs" hint="3–60" error={form.replications < 3 || form.replications > 60 ? "Choose between 3 and 60." : undefined}>{(p) => <Input {...p} type="number" min={3} max={60} value={form.replications} onChange={(e) => setForm({ ...form, replications: Number(e.target.value) })} />}</Field>
                  <Field label="Base seed" hint="Same seed gives the same result">{(p) => <Input {...p} type="number" min={0} value={form.base_seed} onChange={(e) => setForm({ ...form, base_seed: Number(e.target.value) })} />}</Field>
                </div>
                <Field label="Name" optional>{(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
                <InlineError error={run.error} />
                <div><Button type="submit" disabled={run.isPending || invalid}>{run.isPending ? "Running…" : "Run test"}</Button></div>
              </form>
            </Panel>
          )}
        </div>
        {sel && (exp.error ? <ErrorState error={exp.error} /> : !exp.data ? <Loading label="Loading results" /> : exp.data.status === "failed" ? <ErrorState error={new Error(exp.data.error ?? "Failed")} title="This evaluation failed" /> : <Results e={exp.data} />)}
      </div>
    </>
  );
}
