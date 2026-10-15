import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { InlineError } from "@/components/ui/states";
import { ROLE_LABELS } from "@/lib/labels";
import type { Role } from "@/types/api";

export const reasonSchema = z.object({ text: z.string().trim().min(10, "Please write a short sentence (at least 10 characters).").max(4000) });

/** Dialog that requires a written reason (confirm, dismiss, resolve, reopen, clarification). */
export function ReasonDialog({
  open, onOpenChange, title, description, label, hint, submitLabel, onSubmit, pending, error, danger, withDue, defaultDue,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; label: string; hint?: string; submitLabel: string;
  onSubmit: (text: string, due?: string) => void; pending: boolean; error: unknown; danger?: boolean; withDue?: boolean; defaultDue?: string;
}) {
  const form = useForm<{ text: string; due?: string }>({ resolver: zodResolver(reasonSchema.extend({ due: z.string().optional() })), defaultValues: { text: "", due: defaultDue } });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) form.reset({ text: "", due: defaultDue }); onOpenChange(o); }}>
      <DialogContent title={title} description={description}
        footer={<>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="reason-form" variant={danger ? "danger" : "primary"} disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        </>}>
        <form id="reason-form" noValidate className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => onSubmit(v.text, v.due))}>
          <Field label={label} hint={hint} error={form.formState.errors.text?.message}>
            {(p) => <Textarea {...p} rows={4} autoFocus {...form.register("text")} />}
          </Field>
          {withDue && (
            <Field label="Response due" optional hint="Defaults to three days from today.">
              {(p) => <Input {...p} type="date" {...form.register("due")} />}
            </Field>
          )}
          <InlineError error={error} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

const assignSchema = z.object({ user_id: z.string().min(1, "Choose who will own the investigation."), due: z.string().optional(), note: z.string().max(4000).optional() });

export function AssignDialog({ open, onOpenChange, users, current, onSubmit, pending, error }: {
  open: boolean; onOpenChange: (o: boolean) => void; users: { id: string; display_name: string; role: Role }[]; current?: string | null;
  onSubmit: (v: { user_id: string; due?: string; note?: string }) => void; pending: boolean; error: unknown;
}) {
  const form = useForm<z.infer<typeof assignSchema>>({ resolver: zodResolver(assignSchema), defaultValues: { user_id: current ?? "", due: "", note: "" } });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Assign an owner" description="The owner checks the problem and records what happened."
        footer={<>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="assign-form" disabled={pending}>{pending ? "Assigning…" : "Assign"}</Button>
        </>}>
        <form id="assign-form" noValidate className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => onSubmit({ user_id: v.user_id, due: v.due || undefined, note: v.note || undefined }))}>
          <Field label="Owner" error={form.formState.errors.user_id?.message}>
            {(p) => (
              <Select {...p} {...form.register("user_id")}>
                <option value="">Choose a person…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.display_name} — {ROLE_LABELS[u.role]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Follow-up due" optional>{(p) => <Input {...p} type="date" {...form.register("due")} />}</Field>
          <Field label="Note to the owner" optional>{(p) => <Textarea {...p} rows={3} {...form.register("note")} />}</Field>
          <InlineError error={error} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
