import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PlanStatusBadge, SeverityBadge } from "@/components/data-display/badges";
import { DataTable } from "@/components/data-display/DataTable";
import { MetricCard } from "@/components/data-display/MetricCard";
import { parseBudget, withinBudget } from "@/lib/decision-support";
import { SimpleTable } from "@/components/data-display/charts";
import { PageHeader } from "@/components/data-display/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, InlineError, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/useToast";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { Assumptions, CandidateAction, Comparison, Plan, PlanSummary } from "@/types/api";
import { METHOD_LABEL, PlanSheet } from "./PlanSheet";

function AssumptionsEditor({ value, onChange, defaults, labels }: { value: Assumptions; onChange: (a: Assumptions) => void; defaults: Assumptions; labels: Record<string, string> }) {
  const set = (k: string, f: string, v: string) => {
    const n = Number(v);
    onChange({ ...value, action_types: { ...value.action_types, [k]: { ...value.action_types[k], [f]: Number.isFinite(n) ? n : 0 } } });
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-2">
        Benefit = expected weekly reports at the affected units × planning horizon × assumed success probability. Cost = base hours + hours per unit × units.
        These numbers are <strong>illustrative simulation assumptions</strong>, not validated estimates of real-world effectiveness.
      </p>
      <div className="w-40"><Field label="Planning horizon (weeks)">{(p) => <Input {...p} type="number" min={1} max={26} value={value.horizon_weeks} onChange={(e) => onChange({ ...value, horizon_weeks: Math.max(1, Math.min(26, Number(e.target.value) || 1)) })} />}</Field></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-[13px]">
          <caption className="sr-only">Assumptions by action type</caption>
          <thead className="text-left text-xs text-ink-2"><tr>
            <th scope="col" className="py-1.5 pr-3 font-semibold">Action type</th><th scope="col" className="py-1.5 pr-3 font-semibold">Base hours</th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">Hours per unit</th><th scope="col" className="py-1.5 pr-3 font-semibold">Success probability (0–1)</th><th scope="col" className="py-1.5 font-semibold">Time (days)</th>
          </tr></thead>
          <tbody>
            {Object.entries(value.action_types).map(([k, v]) => (
              <tr key={k} className="border-t border-line">
                <th scope="row" className="py-1.5 pr-3 text-left font-medium">{labels[k] ?? k}</th>
                {(["base_hours", "hours_per_unit", "success_probability", "time_days"] as const).map((f) => (
                  <td key={f} className="py-1.5 pr-3">
                    <Input aria-label={`${labels[k]} ${f.replace(/_/g, " ")}`} type="number" step={f === "success_probability" ? 0.05 : 0.5} min={0} max={f === "success_probability" ? 1 : f === "time_days" ? 365 : 500}
                      value={v[f]} onChange={(e) => set(k, f, e.target.value)} className={cn("w-24", v[f] !== defaults.action_types[k][f] && "border-teal-600 bg-aqua-50")} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div><Button variant="secondary" size="sm" onClick={() => onChange(defaults)}>Reset assumptions to defaults</Button></div>
    </div>
  );
}

function SavedPlans({ plans, onOpen }: { plans: Plan[]; onOpen: (id: string) => void }) {
  const [pick, setPick] = useState<string[]>([]);
  const chosen = plans.filter((p) => pick.includes(p.id));
  return (
    <Panel title="Saved plans" description="Open a plan to approve or reject it. Tick two to compare them." bodyClassName="p-0">
      {plans.length === 0 ? <div className="p-4"><EmptyState title="No saved plans yet" /></div> : (
        <div className="px-4 md:px-0">
          <DataTable<Plan> caption="Saved intervention plans" rows={plans} rowKey={(p) => p.id} onRowClick={(p) => onOpen(p.id)} mobileTitle={(p) => `${p.id} · ${p.name}`} minWidth={820}
            columns={[
              { key: "pick", header: <span className="sr-only">Compare</span>, mobileLabel: "Compare", cell: (p) => (
                <input type="checkbox" className="size-5 accent-teal-900 sm:size-4" aria-label={`Compare ${p.id}`} checked={pick.includes(p.id)}
                  onChange={(e) => setPick((x) => (e.target.checked ? [...x.slice(-1), p.id] : x.filter((y) => y !== p.id)))} />
              ) },
              { key: "id", header: "ID", hideOnMobile: true, cell: (p) => <button type="button" className="font-mono text-xs font-medium text-teal-900 hover:underline" onClick={() => onOpen(p.id)}>{p.id}</button> },
              { key: "name", header: "Name", hideOnMobile: true, cell: (p) => p.name },
              { key: "method", header: "Method", cell: (p) => METHOD_LABEL[p.method] },
              { key: "status", header: "Status", cell: (p) => <PlanStatusBadge status={p.status} /> },
              { key: "cost", header: "Cost (h)", align: "right", cell: (p) => fmtNum(p.total_cost_hours, 1) },
              { key: "benefit", header: "Assumed benefit", align: "right", cell: (p) => fmtNum(p.total_expected_benefit, 1) },
              { key: "created", header: "Created", cell: (p) => fmtDate(p.created_at) },
            ]} />
        </div>
      )}
      {chosen.length === 2 && (
        <div className="border-t border-line p-4">
          <h3 className="mb-2 text-sm font-semibold">Comparison: {chosen[0].id} vs {chosen[1].id}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="text-left text-xs text-ink-2"><tr><th scope="col" className="py-1 font-semibold">Measure</th>{chosen.map((p) => <th key={p.id} scope="col" className="py-1 font-semibold">{p.id} · {p.name}</th>)}</tr></thead>
              <tbody>
                {[["Method", (p: Plan) => METHOD_LABEL[p.method]], ["Status", (p: Plan) => p.status], ["Budget (h)", (p: Plan) => String(p.budget_hours)], ["Cost (h)", (p: Plan) => fmtNum(p.total_cost_hours, 1)],
                  ["Assumed benefit", (p: Plan) => fmtNum(p.total_expected_benefit, 1)], ["Benefit per hour", (p: Plan) => p.total_cost_hours ? fmtNum(p.total_expected_benefit / p.total_cost_hours, 2) : "Unavailable"], ["Actions", (p: Plan) => String(p.action_ids.length)]]
                  .map(([label, fn]) => <tr key={label as string} className="border-t border-line"><th scope="row" className="py-1.5 text-left font-medium">{label as string}</th>{chosen.map((p) => <td key={p.id} className="py-1.5 tabular">{(fn as (p: Plan) => string)(p)}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-2">Plans saved with different assumptions are not directly comparable; open each plan to see its assumptions.</p>
        </div>
      )}
    </Panel>
  );
}

function Disclosure({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return (
    <details className="group rounded-md border border-line bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-semibold text-teal-900 [&::-webkit-details-marker]:hidden">
        <span>{title}{count !== undefined && <span className="ml-1.5 font-normal text-ink-2">({count})</span>}</span>
        <span aria-hidden className="text-ink-2 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}

export function PlannerPage() {
  const { can, unitName } = useSession();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const focus = params.get("concern");
  const planParam = params.get("plan");
  const actionsQ = useQuery({ queryKey: ["actions"], queryFn: api.actions });
  const plansQ = useQuery({ queryKey: ["plans"], queryFn: api.plans });
  const [budget, setBudget] = useState("40");
  const parsedBudget = parseBudget(budget);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [onlyFocus, setOnlyFocus] = useState(!!focus);
  const [assumptions, setAssumptions] = useState<Assumptions | null>(null);
  const [saving, setSaving] = useState<PlanSummary | null>(null);
  const [planName, setPlanName] = useState("");
  const [planNotes, setPlanNotes] = useState("");
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { if (actionsQ.data && !assumptions) setAssumptions(actionsQ.data.assumptions); }, [actionsQ.data, assumptions]);

  const pool = useMemo(() => (actionsQ.data?.actions ?? []).filter((a) => !onlyFocus || !focus || a.concern_id === focus), [actionsQ.data, onlyFocus, focus]);
  const included = pool.filter((a) => !excluded.has(a.id)).map((a) => a.id);
  const input = { budget_hours: parsedBudget, action_ids: included, assumptions };
  const result = useMutation({
    mutationFn: (snapshot: { budget_hours: number; action_ids: string[]; assumptions: Assumptions }) => api.compare(snapshot),
  });
  const changed = !!result.data && JSON.stringify(input) !== JSON.stringify(result.variables);
  const current = !!result.data?.optimized && !!result.data?.baseline && !changed && !result.isPending && !result.error;
  const save = useMutation({
    mutationFn: (p: PlanSummary) => api.savePlan({ name: planName, method: p.method, budget_hours: p.budget_hours, action_ids: p.action_ids, assumptions: result.data!.assumptions, notes: planNotes }),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ["plans"] }); setSaving(null); toast(`Plan ${p.id} saved as a draft.`); setParams((x) => { const n = new URLSearchParams(x); n.set("plan", p.id); return n; }); },
  });
  const r: Comparison | undefined = result.data;
  const byId = new Map((r?.candidates ?? actionsQ.data?.actions ?? []).map((a) => [a.id, a]));
  const opt = r?.optimized;
  const base = r?.baseline;
  const overBudget = opt ? !withinBudget(opt.total_cost_hours, opt.budget_hours) : false;
  const gain = opt && base ? opt.total_expected_benefit - base.total_expected_benefit : 0;

  return (
    <>
      <PageHeader title="Intervention Planner" description="Prioritize reporting recovery actions within available resources." />
      {actionsQ.error ? <ErrorState error={actionsQ.error} onRetry={() => actionsQ.refetch()} /> : !actionsQ.data || !assumptions ? <Loading /> : (
        <div className="iris-workspace-stack">
          <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel className="iris-decision-hero iris-planner-hero" motif="network" bodyClassName="p-6 lg:p-8">
            <p className="iris-eyebrow mb-3">Resource-aware reporting response</p>
            <h2 className="text-2xl font-semibold">{current && opt ? `${opt.action_ids.length} recommended actions for ${opt.units_covered.length} reporting units` : "Build a response around the resources you have."}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed">Compare a budget-constrained selection with the priority-first baseline, then save a draft for review. Candidates come from open concerns and may still require verification.</p>
            <div className="mt-5 flex flex-wrap gap-2"><Badge tone="info">Synthetic planning assumptions</Badge><Badge>{current ? "Comparison ready" : "Awaiting explicit comparison"}</Badge></div>
            <p className="mt-4 text-xs text-ink-2">Estimated benefit is expressed in report-weeks over the planning horizon. It is not a guarantee of recovered submissions or health outcomes.</p>
          </Panel>
          <Panel title="Resources and planning controls" variant="secondary" motif="records">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="sm:w-48">
                <Field label="Staff-hours available" hint="0 to 2,000 staff-hours; fractional values are preserved." error={parsedBudget === null ? "Enter a budget from 0 to 2,000 staff-hours." : undefined}>{(p) => <Input {...p} type="number" min={0} max={2000} step="any" value={budget} disabled={result.isPending} onChange={(e) => setBudget(e.target.value)} />}</Field>
              </div>

            </div>
            <p className="mt-3 text-xs text-ink-2">Budget unit: staff time, not currency. Existing dependency and candidate rules apply.</p>
            <Button className="mt-4" disabled={parsedBudget === null || included.length === 0 || result.isPending || save.isPending} onClick={() => { if (parsedBudget !== null) result.mutate({ budget_hours: parsedBudget, action_ids: included, assumptions }); }}>{result.isPending ? "Comparing plans..." : "Run optimization"}</Button>
            {focus && <div className="mt-3"><Checkbox label={`Only plan for concern ${focus}`} checked={onlyFocus} onChange={setOnlyFocus} /></div>}
          </Panel>

          </div>
          {opt && <div className="iris-phase4-metrics grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Compared budget" value={`${String(opt.budget_hours)} h`} detail="Budget submitted for the last explicit comparison." motif="records" />
            <MetricCard label="Estimated plan cost" value={`${fmtNum(opt.total_cost_hours, 1)} h`} detail="Backend cost under the compared assumptions." motif="verify" />
            <MetricCard label="Recommended actions" value={opt.action_ids.length} detail="Backend selection, separate from user candidate inclusion." motif="network" />
            <MetricCard label="Estimated reporting benefit" value={`${fmtNum(opt.total_expected_benefit, 1)} report-weeks`} detail="Assumed report-weeks; effectiveness is not validated." motif="trends" />
          </div>}
          {changed && <p role="status" className="text-sm text-attention-ink">Inputs changed. Results below describe the previous comparison. Run optimization again before saving.</p>}
          {overBudget && <p role="alert" className="text-sm text-critical-ink">The backend returned a plan above the submitted budget. Saving this recommendation is disabled. Adjust the budget explicitly and compare again.</p>}
          <Panel title="Recommended intervention plan" motif="network" description={pool.length ? undefined : "There are no open concerns that need an action right now."}>
            {included.length === 0 ? <p className="text-sm text-ink-2">No actions selected. Open “Choose which actions to consider” below.</p>
              : result.error ? <InlineError error={result.error} />
              : result.isPending ? <Loading label="Comparing intervention plans" />
              : !opt || !base ? <EmptyState title={result.isSuccess ? "Comparison result unavailable" : "No comparison run yet"}>{result.isSuccess ? "The backend did not return both supported plans. Run optimization again or review the server response." : "Review the candidate pool and assumptions, then choose Run optimization."}</EmptyState> : (
              <div className={cn("flex flex-col gap-4", result.isPending && "opacity-60")} aria-busy={result.isPending}>
                {opt.action_ids.length === 0 ? <p className="text-sm text-ink">No action fits in {String(opt.budget_hours)} hours. Try more hours.</p> : (
                  <>
                    <p className="text-[15px] text-ink">
                      Do <strong>{opt.action_ids.length} actions</strong> for {opt.concerns_covered.length} concerns, using <strong>{fmtNum(opt.total_cost_hours, 2)} of {String(opt.budget_hours)} hours</strong>.
                      The model estimates <strong>{fmtNum(opt.total_expected_benefit, 1)} report-weeks of benefit</strong> over the next {r?.assumptions.horizon_weeks} weeks.
                    </p>
                    <ol className="flex flex-col divide-y divide-line rounded-md border border-line">
                      {opt.action_ids.slice(0, showAll ? undefined : 5).map((id, i) => { const a = byId.get(id)!; return (
                        <li key={id} className="flex items-start gap-3 px-3 py-2.5">
                          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-aqua-50 text-xs font-semibold text-teal-900">{i + 1}</span>
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="font-medium text-ink">{a.title}</span>
                            <span className="block text-xs text-ink-2">Estimated {fmtNum(a.expected_benefit, 1)} report-weeks | assumed success {fmtPct(a.success_probability)}</span>
                            <span className="block text-[13px] text-ink-2">{a.unit_ids.map(unitName).slice(0, 2).join(", ")}{a.unit_ids.length > 2 ? ` +${a.unit_ids.length - 2}` : ""} · {fmtNum(a.cost_hours, 1)} h · about {a.time_days} day(s)</span>
                          </span>
                        </li>
                      ); })}
                    </ol>
                    {opt.action_ids.length > 5 && (
                      <button type="button" className="-mt-2 self-start text-[13px] font-medium text-teal-900 hover:underline" aria-expanded={showAll} onClick={() => setShowAll((x) => !x)}>
                        {showAll ? "Show fewer" : `Show all ${opt.action_ids.length} actions`}
                      </button>
                    )}
                    <p className="text-[13px] text-ink-2">
                      {gain > 0.05 ? <>Simply doing the highest-priority items first estimates {fmtNum(base.total_expected_benefit, 1)} report-weeks with the same hours, so the estimated difference is {fmtNum(gain, 1)} report-weeks.</>
                        : <>Doing the highest-priority items first gives the same result here.</>}
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button onClick={() => { save.reset(); setSaving(opt); setPlanName(`Suggested plan, ${budget} h`); }} disabled={!can("plan.create") || !current || overBudget}><Save aria-hidden /> Save this plan</Button>
                      {gain > 0.05 && <Button variant="ghost" onClick={() => { save.reset(); setSaving(base); setPlanName(`Priority-order plan, ${budget} h`); }} disabled={!can("plan.create") || !current || !withinBudget(base.total_cost_hours, base.budget_hours)}>Save the priority-order plan instead</Button>}
                    </div>
                    <details className="text-sm">
                      <summary className="cursor-pointer font-medium text-teal-900">Why were these chosen?</summary>
                      <ul className="mt-2 flex flex-col gap-1 text-[13px]">
                        {opt.explanations.map((e) => <li key={e.id}><span className={e.selected ? "font-medium text-ink" : "text-ink-2"}>{byId.get(e.id)?.title}</span> — {e.reason.replace("Not selected: ", "left out: ").replace("Selected", "chosen")}</li>)}
                      </ul>
                    </details>
                  </>
                )}
                <p className="text-xs text-ink-2">Estimates come from demo assumptions about cost and success, not real-world evidence. No facility is contacted.</p>
              </div>
            )}
          </Panel>

          {opt && base && <Panel title="Matched strategy comparison" description="Same candidate pool and assumptions. The baseline selects highest-priority actions first." motif="trends">
            <div role="region" aria-label="Plan comparison" tabIndex={0} className="overflow-x-auto"><SimpleTable head={["Strategy", "Cost (staff-hours)", "Actions", "Estimated benefit (report-weeks)", "Remaining hours"]} rows={[opt, base].map((p) => [p.method === "optimized" ? "Optimized" : "Priority-first baseline", p.total_cost_hours, p.action_ids.length, p.total_expected_benefit, p.remaining_hours])} /></div>
            <p className="mt-3 text-xs text-ink-2">Results use illustrative cost and success assumptions. Backend optimization uses half-hour capacity increments; fractional budgets can yield an over-budget result, which this page flags without changing the entered budget. Saved plans undergo backend validation.</p>
          </Panel>}
          <Disclosure title="Choose which actions to consider" count={pool.length}>
            <p className="mb-3 text-[13px] text-ink-2">Untick an action to leave it out of the plan.</p>
            <DataTable<CandidateAction>
              caption="Candidate actions" rows={pool} rowKey={(a) => a.id} mobileTitle={(a) => a.title} minWidth={760}
              rowClassName={(a) => (excluded.has(a.id) ? "opacity-55" : a.concern_id === focus ? "bg-mist-50" : undefined)}
              emptyState={<EmptyState title="No candidate actions" />}
              columns={[
                { key: "inc", header: <span className="sr-only">Include</span>, mobileLabel: "Include", cell: (a) => (
                  <input type="checkbox" className="size-5 accent-teal-900 sm:size-4" aria-label={`Include ${a.title}`} checked={!excluded.has(a.id)}
                    onChange={(e) => setExcluded((x) => { const n = new Set(x); if (e.target.checked) n.delete(a.id); else n.add(a.id); return n; })} />
                ) },
                { key: "title", header: "Action", hideOnMobile: true, className: "min-w-[15rem]", cell: (a) => <span><span className="font-medium">{a.title}</span><span className="block text-xs text-ink-2">{a.rationale}</span></span> },
                { key: "concern", header: "For concern", cell: (a) => <Link className="text-teal-900 hover:underline" to={`/investigations/${a.concern_id}`}>{a.concern_id}</Link> },
                { key: "priority", header: "Priority", cell: (a) => (a.concern_severity ? <SeverityBadge severity={a.concern_severity} /> : "—") },
                { key: "cost", header: "Hours", align: "right", cell: (a) => fmtNum(a.cost_hours, 1) },
                { key: "deps", header: "Needs first", cell: (a) => (a.depends_on.length ? a.depends_on.map((d) => byId.get(d)?.action_type_label ?? d).join(", ") : "—") },
              ]} />
          </Disclosure>

          <Disclosure title="Change the assumptions (advanced)">
            <AssumptionsEditor value={assumptions} onChange={setAssumptions} defaults={actionsQ.data.default_assumptions} labels={actionsQ.data.action_types} />
          </Disclosure>

          {plansQ.error && <ErrorState error={plansQ.error} onRetry={() => plansQ.refetch()} title="Saved plans unavailable" />}
          {plansQ.data && <SavedPlans plans={plansQ.data} onOpen={(id) => setParams((x) => { const n = new URLSearchParams(x); n.set("plan", id); return n; })} />}
        </div>
      )}

      <Dialog open={!!saving} onOpenChange={(o) => { if (!o && !save.isPending) setSaving(null); }}>
        <DialogContent title="Save plan" description={saving ? `${saving.action_ids.length} actions · ${fmtNum(saving.total_cost_hours, 1)} hours. It will be saved as a draft for approval.` : undefined}
          footer={<><Button variant="secondary" disabled={save.isPending} onClick={() => setSaving(null)}>Cancel</Button><Button onClick={() => saving && save.mutate(saving)} disabled={save.isPending || planName.trim().length < 3}>{save.isPending ? "Saving…" : "Save draft"}</Button></>}>
          <div className="flex flex-col gap-4">
            <Field label="Plan name" error={planName.trim().length < 3 ? "Use at least 3 characters." : undefined}>{(p) => <Input {...p} maxLength={200} value={planName} onChange={(e) => setPlanName(e.target.value)} />}</Field>
            <Field label="Notes" optional>{(p) => <Textarea {...p} rows={2} maxLength={2000} value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} />}</Field>
            <InlineError error={save.error} />
          </div>
        </DialogContent>
      </Dialog>
      <PlanSheet planId={planParam} onClose={() => setParams((x) => { const n = new URLSearchParams(x); n.delete("plan"); return n; })} />
    </>
  );
}
