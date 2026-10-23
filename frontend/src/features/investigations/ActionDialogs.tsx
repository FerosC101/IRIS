import { useEffect } from "react";
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
    <Dialog open={open} onOpenChange={(o) => { if (pending) return; if (!o) form.reset({ text: "", due: defaultDue }); onOpenChange(o); }}>
      <DialogContent title={title} description={description}
        footer={<>
          <Button variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
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

const evidenceSchema = z.object({
  title: z.string().trim().min(3, "Give the evidence a short title.").max(200),
  detail: z.string().trim().min(10, "Describe what this evidence shows (at least 10 characters).").max(4000),
  link: z.union([z.literal(""), z.string().trim().max(500).regex(/^https?:\/\//i,"Links must start with http:// or https://.")]),
});

/** Attach evidence as a description and optional link. Files are not uploaded. */
export function EvidenceDialog({ open, onOpenChange, onSubmit, pending, error }: {
  open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (v: { title: string; detail: string; link?: string }) => void; pending: boolean; error: unknown;
}) {
  const form = useForm<z.infer<typeof evidenceSchema>>({ resolver: zodResolver(evidenceSchema), defaultValues: { title: "", detail: "", link: "" } });
  useEffect(() => { if (open) form.reset({ title: "", detail: "", link: "" }); }, [open, form]);
  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) onOpenChange(o); }}>
      <DialogContent title="Attach evidence" description="Describe what you checked. Add a link if the source is stored elsewhere; files are not uploaded."
        footer={<>
          <Button variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="evidence-form" disabled={pending}>{pending ? "Attaching…" : "Attach evidence"}</Button>
        </>}>
        <form id="evidence-form" noValidate className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => onSubmit({ title: v.title, detail: v.detail, link: v.link || undefined }))}>
          <Field label="Title" error={errors.title?.message}>{(p) => <Input {...p} autoFocus {...form.register("title")} />}</Field>
          <Field label="What it shows" error={errors.detail?.message}>{(p) => <Textarea {...p} rows={4} {...form.register("detail")} />}</Field>
          <Field label="Link" optional error={errors.link?.message} hint="For example, a shared folder with the register scan.">{(p) => <Input {...p} type="url" inputMode="url" {...form.register("link")} />}</Field>
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
  useEffect(() => { if (open) form.reset({ user_id: current ?? "", due: "", note: "" }); }, [open, current, form]);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) onOpenChange(o); }}>
      <DialogContent title="Assign an owner" description="The owner checks the problem and records what happened."
        footer={<>
          <Button variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
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
