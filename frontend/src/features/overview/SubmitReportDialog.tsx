import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { InlineError } from "@/components/ui/states";
import { useToast } from "@/hooks/useToast";
import { fmtDateTime, fmtPeriod } from "@/lib/format";
import { api } from "@/services/api";
import type { Task } from "@/types/api";

export const reportSchema = z
  .object({
    value: z.string(),
    blank: z.boolean(),
    note: z.string().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.blank) return;
    if (v.value.trim() === "") ctx.addIssue({ code: "custom", path: ["value"], message: "Enter a count, or tick ‘Value not available’." });
    else if (!/^\d+$/.test(v.value.trim())) ctx.addIssue({ code: "custom", path: ["value"], message: "Enter a whole number of zero or more." });
  });
type FormValues = z.infer<typeof reportSchema>;

export function SubmitReportDialog({ task, open, onOpenChange }: { task: Task | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm<FormValues>({ resolver: zodResolver(reportSchema), defaultValues: { value: "", blank: false, note: "" } });
  const blank = form.watch("blank");
  const m = useMutation({
    mutationFn: (v: FormValues) =>
      api.submitReport({ unit_id: task!.unit_id, category_code: task!.category_code!, period_start: task!.period_start!, value: v.blank ? null : Number(v.value), blank: v.blank, note: v.note || undefined }),
    onSuccess: (r) => {
      toast(r.late ? "Report submitted. It was recorded as late because the due date has passed." : "Report submitted on time.");
      qc.invalidateQueries();
      form.reset();
      onOpenChange(false);
    },
  });
  if (!task) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { form.reset(); m.reset(); } onOpenChange(o); }}>
      <DialogContent
        title={task.title}
        description={<>Period {fmtPeriod(task.period_start!, task.period_end)} · due {fmtDateTime(task.due_at)}</>}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" form="submit-report" disabled={m.isPending}>{m.isPending ? "Submitting…" : "Submit report"}</Button>
          </>
        }
      >
        <form id="submit-report" className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => m.mutate(v))} noValidate>
          <Field label="Number of cases" error={form.formState.errors.value?.message} hint="Enter 0 if there were no cases. Zero is different from ‘not available’.">
            {(p) => <Input {...p} inputMode="numeric" autoComplete="off" disabled={blank} {...form.register("value")} />}
          </Field>
          <Checkbox label="Value not available (leave blank)" description="Use only if the count could not be determined. It will be recorded as blank, not zero."
            checked={blank} onChange={(v) => form.setValue("blank", v, { shouldValidate: true })} />
          <Field label="Note" optional error={form.formState.errors.note?.message}>
            {(p) => <Textarea {...p} rows={2} {...form.register("note")} />}
          </Field>
          <InlineError error={m.error} />
          <p className="text-xs text-ink-2">This is a demonstration: the report is stored in the local prototype database only.</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
