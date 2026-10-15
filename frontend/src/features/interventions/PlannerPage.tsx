import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PlanStatusBadge, SeverityBadge } from "@/components/data-display/badges";
import { DataTable } from "@/components/data-display/DataTable";
import { PageHeader } from "@/components/data-display/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, InlineError, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/useToast";
import { fmtDate, fmtNum } from "@/lib/format";
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
                    <Input aria-label={`${labels[k]} ${f.replace(/_/g, " ")}`} type="number" step={f === "success_probability" ? 0.05 : 0.5} min={0} max={f === "success_probability" ? 1 : 500}
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
                {[["Method", (p: Plan) => METHOD_LABEL[p.method]], ["Status", (p: Plan) => p.status], ["Budget (h)", (p: Plan) => fmtNum(p.budget_hours, 1)], ["Cost (h)", (p: Plan) => fmtNum(p.total_cost_hours, 1)],
                  ["Assumed benefit", (p: Plan) => fmtNum(p.total_expected_benefit, 1)], ["Benefit per hour", (p: Plan) => fmtNum(p.total_cost_hours ? p.total_expected_benefit / p.total_cost_hours : 0, 2)], ["Actions", (p: Plan) => String(p.action_ids.length)]]
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

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = window.setTimeout(() => setV(value), ms); return () => window.clearTimeout(t); }, [value, ms]);
  return v;
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
  const [budget, setBudget] = useState(40);
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
  const input = useDebounced({ budget, included, assumptions }, 350);
  const result = useQuery({
    queryKey: ["compare", input],
    queryFn: () => api.compare({ budget_hours: input.budget, action_ids: input.included, assumptions: input.assumptions }),
    enabled: !!input.assumptions && input.included.length > 0,
    placeholderData: (p) => p,
  });
  const save = useMutation({
    mutationFn: (p: PlanSummary) => api.savePlan({ name: planName, method: p.method, budget_hours: budget, action_ids: p.action_ids, assumptions, notes: planNotes }),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ["plans"] }); setSaving(null); toast(`Plan ${p.id} saved as a draft.`); setParams((x) => { const n = new URLSearchParams(x); n.set("plan", p.id); return n; }); },
  });
  const r: Comparison | undefined = result.data;
  const byId = new Map((r?.candidates ?? actionsQ.data?.actions ?? []).map((a) => [a.id, a]));
  const opt = r?.optimized;
  const base = r?.baseline;
  const gain = opt && base ? opt.total_expected_benefit - base.total_expected_benefit : 0;

  return (
    <>
      <PageHeader title="Plan actions" description="Enter the staff time you have. IRIS suggests the actions that should help reporting the most."
        meta={<Badge tone="info">Estimates use demo assumptions</Badge>} />
      {actionsQ.error ? <ErrorState error={actionsQ.error} onRetry={() => actionsQ.refetch()} /> : !actionsQ.data || !assumptions ? <Loading /> : (
        <div className="flex max-w-5xl flex-col gap-5">
          <Panel title="1. How much staff time do you have?">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="sm:w-48">
                <Field label="Staff-hours available">{(p) => <Input {...p} type="number" min={0} max={2000} step={1} value={budget} onChange={(e) => setBudget(Math.max(0, Math.min(2000, Number(e.target.value) || 0)))} />}</Field>
              </div>
              <input type="range" min={0} max={150} step={1} value={Math.min(budget, 150)} onChange={(e) => setBudget(Number(e.target.value))} aria-label="Staff-hours slider" className="h-11 w-full accent-teal-900 sm:max-w-sm" />
            </div>
            {focus && <div className="mt-3"><Checkbox label={`Only plan for concern ${focus}`} checked={onlyFocus} onChange={setOnlyFocus} /></div>}
          </Panel>

          <Panel title="2. Suggested plan" description={pool.length ? undefined : "There are no open concerns that need an action right now."}>
            {included.length === 0 ? <p className="text-sm text-ink-2">No actions selected. Open “Choose which actions to consider” below.</p>
              : result.error ? <InlineError error={result.error} />
              : !opt || !base ? <Loading label="Working out the best plan" /> : (
              <div className={cn("flex flex-col gap-4", result.isFetching && "opacity-60")} aria-busy={result.isFetching}>
                {opt.action_ids.length === 0 ? <p className="text-sm text-ink">No action fits in {fmtNum(opt.budget_hours)} hours. Try more hours.</p> : (
                  <>
                    <p className="text-[15px] text-ink">
                      Do <strong>{opt.action_ids.length} actions</strong> for {opt.concerns_covered.length} concerns, using <strong>{fmtNum(opt.total_cost_hours, 1)} of {fmtNum(opt.budget_hours)} hours</strong>.
                      This is expected to bring back about <strong>{fmtNum(opt.total_expected_benefit, 0)} missing reports</strong> over the next {r?.assumptions.horizon_weeks} weeks.
                    </p>
                    <ol className="flex flex-col divide-y divide-line rounded-md border border-line">
                      {opt.action_ids.slice(0, showAll ? undefined : 5).map((id, i) => { const a = byId.get(id)!; return (
                        <li key={id} className="flex items-start gap-3 px-3 py-2.5">
                          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-aqua-50 text-xs font-semibold text-teal-900">{i + 1}</span>
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="font-medium text-ink">{a.title}</span>
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
                      {gain > 0.05 ? <>Simply doing the highest-priority items first would bring back about {fmtNum(base.total_expected_benefit, 0)} reports with the same hours, so this plan helps about {fmtNum(gain, 0)} more.</>
                        : <>Doing the highest-priority items first gives the same result here.</>}
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button onClick={() => { setSaving(opt); setPlanName(`Suggested plan, ${budget} h`); }} disabled={!can("plan.create")}><Save aria-hidden /> Save this plan</Button>
                      {gain > 0.05 && <Button variant="ghost" onClick={() => { setSaving(base); setPlanName(`Priority-order plan, ${budget} h`); }} disabled={!can("plan.create")}>Save the priority-order plan instead</Button>}
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
                { key: "deps", header: "Needs first", cell: (a) => (a.depends_on.length ? a.depends_on.map((d) => byId.get(d)?.action_type_label ?? "Already done").join(", ") : "—") },
              ]} />
          </Disclosure>

          <Disclosure title="Change the assumptions (advanced)">
            <AssumptionsEditor value={assumptions} onChange={setAssumptions} defaults={actionsQ.data.default_assumptions} labels={actionsQ.data.action_types} />
          </Disclosure>

          {plansQ.data && <SavedPlans plans={plansQ.data} onOpen={(id) => setParams((x) => { const n = new URLSearchParams(x); n.set("plan", id); return n; })} />}
        </div>
      )}

      <Dialog open={!!saving} onOpenChange={(o) => !o && setSaving(null)}>
        <DialogContent title="Save plan" description={saving ? `${saving.action_ids.length} actions · ${fmtNum(saving.total_cost_hours, 1)} hours. It will be saved as a draft for approval.` : undefined}
          footer={<><Button variant="secondary" onClick={() => setSaving(null)}>Cancel</Button><Button onClick={() => saving && save.mutate(saving)} disabled={save.isPending || planName.trim().length < 3}>{save.isPending ? "Saving…" : "Save draft"}</Button></>}>
          <div className="flex flex-col gap-4">
            <Field label="Plan name" error={planName.trim().length < 3 ? "Use at least 3 characters." : undefined}>{(p) => <Input {...p} value={planName} onChange={(e) => setPlanName(e.target.value)} />}</Field>
            <Field label="Notes" optional>{(p) => <Textarea {...p} rows={2} value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} />}</Field>
            <InlineError error={save.error} />
          </div>
        </DialogContent>
      </Dialog>
      <PlanSheet planId={planParam} onClose={() => setParams((x) => { const n = new URLSearchParams(x); n.delete("plan"); return n; })} />
    </>
  );
}
