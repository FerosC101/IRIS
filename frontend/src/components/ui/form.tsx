import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const control =
  "iris-control block w-full rounded-md border border-line-strong px-3 py-2 text-sm text-ink placeholder:text-ink-2 disabled:bg-porcelain disabled:text-ink-2 aria-[invalid=true]:border-critical min-h-11 sm:min-h-10";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(control, className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, rows = 3, ...p }, ref) => (
  <textarea ref={ref} rows={rows} className={cn(control, "min-h-20 leading-relaxed", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(control, "appearance-auto pr-8", className)} {...p}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ htmlFor, children, className, optional }: { htmlFor?: string; children: ReactNode; className?: string; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1 block text-[13px] font-medium text-ink", className)}>
      {children}
      {optional && <span className="ml-1 font-normal text-ink-2">(optional)</span>}
    </label>
  );
}

/** Label + control + hint + error, wired with aria attributes. */
export function Field({
  label, hint, error, optional, children, className,
}: {
  label: string; hint?: ReactNode; error?: string; optional?: boolean; className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={className}>
      <Label htmlFor={id} optional={optional}>{label}</Label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": [hintId, errId].filter(Boolean).join(" ") || undefined })}
      {hint && <p id={hintId} className="mt-1 text-xs text-ink-2">{hint}</p>}
      {error && <p id={errId} className="mt-1 text-xs font-medium text-critical-ink">{error}</p>}
    </div>
  );
}

export function Checkbox({ label, description, checked, onChange, disabled, id }: { label: ReactNode; description?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; id?: string }) {
  const gen = useId();
  const cid = id ?? gen;
  return (
    <div className="flex items-start gap-2.5">
      <input id={cid} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-teal-900 sm:size-4" />
      <label htmlFor={cid} className="text-sm leading-snug">
        <span className="text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-2">{description}</span>}
      </label>
    </div>
  );
}
