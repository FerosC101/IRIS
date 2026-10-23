import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { InlineError, Loading } from "@/components/ui/states";
import { useToast } from "@/hooks/useToast";
import { api } from "@/services/api";

const RESET_WORD = "RESET";

/** Reset the demo database, optionally choosing which simulated scenarios to inject.
 * Destructive, so the dialog requires the typed confirmation the server also checks. */
export function ResetDemo({ configurable = false }: { configurable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim() === RESET_WORD;
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const sc = useQuery({ queryKey: ["scenarios"], queryFn: api.scenarios, enabled: configurable });
  const ids = selected ?? new Set(sc.data?.map((s) => s.id) ?? []);
  const m = useMutation({
    mutationFn: () => api.resetDemo(typed.trim(), configurable && sc.data ? [...ids] : undefined),
    onSuccess: (r) => { qc.clear(); setOpen(false); setTyped(""); nav("/"); toast(`Demo data reset: ${r.records.toLocaleString()} records, ${r.concerns} concerns, ${r.scenarios.length} scenarios.`); },
  });
  return (
    <>
      {configurable && (
        <div className="mb-4">
          {!sc.data ? <Loading label="Loading scenarios" /> : (
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
              {sc.data.map((s) => (
                <li key={s.id} className="p-3">
                  <Checkbox checked={ids.has(s.id)} onChange={(v) => { const n = new Set(ids); if (v) n.add(s.id); else n.delete(s.id); setSelected(n); }}
                    label={<><span className="font-medium">{s.kind_label}</span> <span className="text-ink-2">· {s.unit_names.join(", ")} · {s.period}</span></>}
                    description={<>{s.description} <span className="font-medium">{s.is_disruption ? "Ground truth: reporting disruption." : "Ground truth: not a reporting failure."}</span></>} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Button variant={configurable ? "primary" : "secondary"} onClick={() => setOpen(true)}><RotateCcw aria-hidden /> {configurable ? "Reset with selected scenarios" : "Reset demo data"}</Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setTyped(""); m.reset(); } }}>
        <DialogContent title="Reset the demo data?" description="All changes made in this demo (notes, decisions, plans, imports, submitted reports) will be removed and the simulated dataset regenerated from its fixed seed."
          footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Keep my changes</Button><Button variant="danger" onClick={() => m.mutate()} disabled={m.isPending || !confirmed}>{m.isPending ? "Resetting…" : "Reset demo data"}</Button></>}>
          <p className="text-sm text-ink">{configurable ? `${ids.size} of ${sc.data?.length ?? 0} scenarios will be injected.` : "All demo scenarios will be injected."} Resetting takes a few seconds because the evaluation experiment is re-run.</p>
          <Field className="mt-3" label={`Type ${RESET_WORD} to confirm`} hint="This cannot be undone.">
            {(p) => <Input {...p} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />}
          </Field>
          <div className="mt-3"><InlineError error={m.error} /></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
