import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChipFilter } from "@/components/data-display/FilterBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Textarea } from "@/components/ui/form";
import { InlineError, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/useToast";
import { fmtDateTime } from "@/lib/format";
import type { Tone } from "@/lib/labels";
import { api } from "@/services/api";
import type { LeadReview, LeadReviewStatus, LeadType } from "@/types/api";

const TONE: Record<LeadReviewStatus, Tone> = { in_review: "attention", confirmed: "critical", not_a_problem: "positive" };
const CLOSING: LeadReviewStatus[] = ["confirmed", "not_a_problem"];

export function useRealStatus() {
  return useQuery({ queryKey: ["real", "status"], queryFn: api.realStatus, staleTime: 60_000 });
}

export function ReviewBadge({ review }: { review: LeadReview | null }) {
  if (!review) return <Badge className="whitespace-nowrap">Not reviewed</Badge>;
  return <Badge tone={TONE[review.status]}>{review.status_label}</Badge>;
}

/** History of human reviews for one lead, and the form to add one. Closing a lead needs a reason and evidence. */
export function LeadReviewSection({ leadType, leadId }: { leadType: LeadType; leadId: string }) {
  const { can, meta } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const st = useRealStatus();
  const hist = useQuery({ queryKey: ["real", "history", leadType, leadId], queryFn: () => api.leadHistory(leadType, leadId) });
  const [status, setStatus] = useState<LeadReviewStatus>("in_review");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [tried, setTried] = useState(false);
  const save = useMutation({
    mutationFn: () => api.reviewLead({ lead_type: leadType, lead_id: leadId, status, note, evidence }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["real"] });
      setNote(""); setEvidence(""); setTried(false); setStatus("in_review");
      toast(`Recorded: ${r.review.status_label}.`);
    },
  });
  const labels = st.data?.review_statuses;
  const minReason = st.data?.min_reason ?? 10;
  const minEvidence = st.data?.min_evidence ?? 5;
  const closing = CLOSING.includes(status);
  const noteErr = closing && note.trim().length < minReason ? `Give a reason (at least ${minReason} characters).` : undefined;
  const evErr = closing && evidence.trim().length < minEvidence ? "Say what you checked, for example a call log, register page or link." : undefined;
  const roleName = (r: string) => meta?.roles.find((x) => x.id === r)?.name ?? r;
  const latest = hist.data?.[0];

  return (
    <section aria-labelledby={`review-${leadId}`} className="flex flex-col gap-3">
      <h3 id={`review-${leadId}`} className="text-sm font-semibold">Human review</h3>
      {latest && CLOSING.includes(latest.status) && (
        <Callout variant="human-confirmed" label={latest.status === "confirmed" ? "Human-confirmed" : "Human-reviewed · not a problem"} by={`${latest.by}, ${fmtDateTime(latest.at)}`}>
          <p>{latest.note}</p>
          <p className="mt-1 text-xs text-ink-2">Evidence: {latest.evidence}</p>
        </Callout>
      )}
      {hist.isLoading ? <Loading label="Loading review history" /> : hist.error ? <InlineError error={hist.error} /> : hist.data && hist.data.length > 0 ? (
        <ol className="flex flex-col gap-2" aria-label="Review history, newest first">
          {hist.data.map((h) => (
            <li key={h.id} className="rounded-md border border-line px-3 py-2 text-[13px]">
              <div className="flex flex-wrap items-center gap-2"><ReviewBadge review={h} /><span className="text-xs text-ink-2">{h.by} · {roleName(h.role)} · {fmtDateTime(h.at)}</span></div>
              {h.note && <p className="mt-1">{h.note}</p>}
              {h.evidence && <p className="mt-0.5 text-xs text-ink-2">Evidence: {h.evidence}</p>}
              {h.model_run_id && <p className="mt-0.5 text-[11px] text-ink-2">Model run {h.model_run_id}</p>}
            </li>
          ))}
        </ol>
      ) : <p className="text-[13px] text-ink-2">Nobody has reviewed this lead yet.</p>}

      {can("real.review") ? (
        <form className="flex flex-col gap-3 rounded-md border border-line bg-porcelain p-3" noValidate
          onSubmit={(e) => { e.preventDefault(); setTried(true); if (!noteErr && !evErr) save.mutate(); }}>
          <ChipFilter label="Review decision" value={status} onChange={(v) => { setStatus(v); setTried(false); }}
            options={(["in_review", "confirmed", "not_a_problem"] as const).map((v) => ({ value: v, label: labels?.[v] ?? v }))} />
          <Field label={closing ? "Reason" : "Note"} optional={!closing} error={tried ? noteErr : undefined}
            hint={status === "confirmed" ? "What did you find? For example cases in the hospital log that were not reported." : status === "not_a_problem" ? "Why is this zero or low count genuine?" : "What are you checking, and with whom?"}>
            {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />}
          </Field>
          <Field label="Evidence checked" optional={!closing} error={tried ? evErr : undefined} hint="A call log, register page, lab report or link.">
            {(p) => <Input {...p} value={evidence} onChange={(e) => setEvidence(e.target.value)} />}
          </Field>
          {save.error && <InlineError error={save.error} />}
          <div><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Record review"}</Button></div>
        </form>
      ) : <p className="text-[13px] text-ink-2">Only RESU analysts and provincial coordinators can record a review.</p>}
    </section>
  );
}
