import { useQuery } from "@tanstack/react-query";
import { DataTableToggle, SimpleTable } from "@/components/data-display/charts";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { fmtPct } from "@/lib/format";
import { api } from "@/services/api";
import type { MetricRow, RealMetrics } from "@/types/api";
import { BarRows } from "./charts";
import { fmtMetric } from "./format";

const MODEL_B = "Model B · zero-report prioritizer";
const REAL_TEST = "Real 2020 (test): swapped zeros";
const SYNTH_TEST = "Synthetic 2020 (test): injected zeros";
const dec = (v: number) => v.toFixed(2);
/** Pipeline cells such as "0.089 (0.010–0.175)": the estimate is the leading number. */
const lead = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : Number.NaN);

function ModelB({ z }: { z: NonNullable<RealMetrics["model_b_zero"]> }) {
  const res = z.summary.results;
  const real = res[REAL_TEST];
  const synth = res[SYNTH_TEST];
  const nz = z.summary.diagnostics.normal_zeros;
  const methods = real ? Object.entries(real.methods).sort((a, b) => (b[1].average_precision ?? 0) - (a[1].average_precision ?? 0)) : [];
  return (
    <>
      {real && (
        <Panel title="Model B: ranking real reporting problems (average precision)" description={`Test on real 2020 data, not used to build the model: ${real.positives} known problems (zeros swapped in the source records) among ${real.zero_reports} zero reports. 1.0 would mean every problem ranked above every genuine zero.`}>
          <BarRows caption="Average precision on real 2020 zero reports, by method" series={[{ key: "ap", label: "Average precision" }]} fmt={dec}
            rows={methods.map(([m, v]) => ({ label: m, values: [v.average_precision], strong: m === MODEL_B }))} />
        </Panel>
      )}
      {real && synth && (
        <Panel title="Real versus simulated test, 2020 (average precision)" description="The same methods on real 2020 problems and on failures simulated into 2020. These are separate experiments and are not combined. Model B leads on the real test but not on the simulated one.">
          <BarRows caption="Average precision, real versus synthetic 2020" fmt={dec}
            series={[{ key: "real", label: "Real 2020" }, { key: "synth", label: "Synthetic 2020" }]}
            rows={methods.map(([m]) => m).filter((m) => synth.methods[m] && !m.includes("(experiment)")).slice(0, 4).map((m) => ({ label: m, values: [real.methods[m].average_precision, synth.methods[m].average_precision], strong: m === MODEL_B }))} />
        </Panel>
      )}
      {nz["2019"] && nz["2020"] && (
        <Callout variant="info" label="Why 2020 has more false alerts">
          {fmtPct(nz["2020"].share_above_high_cut)} of genuine zero reports in 2020 reached High priority, against {fmtPct(nz["2019"].share_above_high_cut)} in 2019.
          During COVID-19 many places in the same region reported zero together ({fmtPct(nz["2020"].mean_region_other_zero_share)} on average, against {fmtPct(nz["2019"].mean_region_other_zero_share)}), and the model reads that as a sign of a shared reporting problem.
        </Callout>
      )}
    </>
  );
}

function ModelA({ rows }: { rows: MetricRow[] }) {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const recall = keys.find((k) => k.startsWith("recall"));
  const fa = keys.find((k) => k.startsWith("false-alert"));
  if (!recall || !fa) return null;
  return (
    <Panel title="Model A: catching real problems vs raising false alerts" description="Real 2020 data. A good method catches many problems (long first bar) with few false alerts (short second bar).">
      <BarRows caption="Model A and baselines: share of real 2020 problems caught and false-alert rate" fmt={(v) => fmtPct(v)}
        series={[{ key: "recall", label: "Problems caught" }, { key: "fa", label: "False alerts" }]}
        rows={rows.map((r) => ({ label: String(r.method), values: [lead(r[recall]), lead(r[fa])].map((v) => (Number.isNaN(v) ? null : v)), strong: r.method === "Model A v2" }))} />
    </Panel>
  );
}

const STATUS_TONE = (s: string) => (s.startsWith("Met") ? "positive" : s.startsWith("Partly") ? "attention" : "neutral") as "positive" | "attention" | "neutral";

function Objectives({ rows, targets }: { rows: MetricRow[]; targets: MetricRow[] }) {
  const k = rows.length ? Object.keys(rows[0]) : [];
  return (
    <Panel title="Project objectives" variant="secondary" description="Tap an objective for the evidence.">
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((r) => (
          <li key={String(r[k[0]])} className="py-2.5">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <span className="text-[13px] font-medium">{String(r[k[0]]).replace(/^\d+\.\s*/, "")}</span>
                <Badge tone={STATUS_TONE(String(r[k[1]]))} className="max-w-[45%] shrink-0 text-right">{String(r[k[1]])}</Badge>
              </summary>
              <p className="mt-1.5 text-[13px] text-ink-2">{String(r[k[2]] ?? "")}</p>
            </details>
          </li>
        ))}
      </ul>
      {targets.length > 0 && (
        <DataTableToggle label="Show Model A targets">
          <SimpleTable head={Object.keys(targets[0])} rows={targets.map((t) => Object.values(t).map(fmtMetric))} />
        </DataTableToggle>
      )}
    </Panel>
  );
}

export function ResultsTab() {
  const q = useQuery({ queryKey: ["real", "metrics"], queryFn: api.realMetrics });
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Loading label="Loading model results" />;
  const { model_a: a, model_b_zero: z } = q.data;
  return (
    <div className="flex flex-col gap-5">
      {z ? <ModelB z={z} /> : <EmptyState title="Model B results are not available" />}
      {a ? <><ModelA rows={a.detection_real_swaps_2020} /><Objectives rows={a.objectives} targets={a.model_a_done_when} /></> : <EmptyState title="Model A results are not available" />}
    </div>
  );
}
