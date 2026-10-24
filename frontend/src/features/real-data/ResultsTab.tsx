import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, Loading } from "@/components/ui/states";
import { fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { MetricRow, RealMetrics } from "@/types/api";
import { fmtMetric } from "./format";

const MODEL_B = "Model B · zero-report prioritizer";

function Table({ caption, head, rows, strong }: { caption: string; head: string[]; rows: string[][]; strong?: (i: number) => boolean }) {
  return (
    <div className="overflow-x-auto" role="region" aria-label={caption} tabIndex={0}>
      <table className="w-full min-w-[36rem] text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-left text-xs text-ink-2"><tr>{head.map((h, i) => <th key={h} scope="col" className={cn("py-1.5 pr-3 font-semibold", i > 0 && "text-right")}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r[0]} className={cn("border-t border-line", strong?.(i) && "font-semibold")}>
            {r.map((c, j) => (j === 0 ? <th key={j} scope="row" className="py-1.5 pr-3 text-left font-[inherit]">{c}</th> : <td key={j} className="py-1.5 pr-3 text-right tabular">{c}</td>))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** A pipeline metrics table as written: its own column names, numbers and intervals formatted. */
function RowsTable({ caption, rows, text = false }: { caption: string; rows: MetricRow[]; text?: boolean }) {
  if (!rows.length) return <p className="text-sm text-ink-2">Not available.</p>;
  const keys = Object.keys(rows[0]);
  const head = keys.map((k) => k.charAt(0).toUpperCase() + k.slice(1));
  if (text) {
    return (
      <div className="overflow-x-auto" role="region" aria-label={caption} tabIndex={0}>
        <table className="w-full min-w-[36rem] text-[13px]">
          <caption className="sr-only">{caption}</caption>
          <thead className="text-left text-xs text-ink-2"><tr>{head.map((h) => <th key={h} scope="col" className="py-1.5 pr-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line align-top">{keys.map((k) => <td key={k} className="py-1.5 pr-3">{fmtMetric(r[k])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  return <Table caption={caption} head={head} rows={rows.map((r) => keys.map((k) => fmtMetric(r[k])))} />;
}

function ModelB({ z }: { z: NonNullable<RealMetrics["model_b_zero"]> }) {
  const nz = z.summary.diagnostics.normal_zeros;
  const sw = z.summary.diagnostics.swaps_2020;
  return (
    <Panel title="Model B · zero-report prioritizer" description="How well the ranking puts real reporting problems at the top. Tested on data the model never saw (2020); real and synthetic results are kept apart.">
      <div className="flex flex-col gap-5">
        {Object.entries(z.summary.results).map(([name, r]) => (
          <section key={name} aria-label={name}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{name}</h3>
              <Badge tone={r.kind === "real" ? "teal" : "neutral"}>{r.kind === "real" ? "Real data" : "Synthetic test"}</Badge>
              <span className="text-xs text-ink-2">{r.positives} known problems among {r.zero_reports} zero reports</span>
            </div>
            <Table caption={`${name}: method comparison`} head={["Method", "Average precision", "AUC", "High band catches", "High band false alerts"]}
              rows={Object.entries(r.methods).map(([m, v]) => [m, fmtMetric(v.average_precision), fmtMetric(v.auc), fmtPct(v.high_band_recall), fmtPct(v.high_band_false_alert_rate)])}
              strong={(i) => Object.keys(r.methods)[i] === MODEL_B} />
          </section>
        ))}
        {nz["2019"] && nz["2020"] && (
          <Callout variant="info" label="Why 2020 has more false alerts">
            In 2019, {fmtPct(nz["2019"].share_above_high_cut)} of genuine zero reports reached the High band; in 2020, {fmtPct(nz["2020"].share_above_high_cut)} did,
            because on average {fmtPct(nz["2020"].mean_region_other_zero_share)} of other places in the same region also reported zero (against {fmtPct(nz["2019"].mean_region_other_zero_share)} in 2019).
            Known problems fall in only {sw.weeks_with_swaps} weeks of 2020, up to {sw.max_swaps_in_a_week} in one week, so a short weekly list cannot catch them all.
          </Callout>
        )}
      </div>
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
      {a ? (
        <>
          <Panel title="Model A · detection on real 2020 data" description="Known problems are real 2020 records whose zero and non-zero values were swapped in the source. Rates with 95% intervals.">
            <RowsTable caption="Model A detection on real 2020 swaps" rows={a.detection_real_swaps_2020} />
          </Panel>
          <Panel title="Model A · targets" variant="secondary"><RowsTable caption="Model A targets" rows={a.model_a_done_when} text /></Panel>
          <Panel title="Project objectives" variant="secondary" description={a.disclaimer}><RowsTable caption="Project objectives and status" rows={a.objectives} text /></Panel>
        </>
      ) : <EmptyState title="Model A results are not available" />}
    </div>
  );
}
