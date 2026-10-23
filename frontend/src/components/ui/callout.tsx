import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CalloutVariant = "model-flag" | "human-confirmed" | "info";

const VARIANTS: Record<CalloutVariant, { box: string; eyebrow: string; icon: ReactNode; prefix: string }> = {
  // A detector output: always "flag", never "finding", and never a cause.
  "model-flag": { box: "bg-missing-pale", eyebrow: "text-critical-ink", icon: <AlertTriangle className="size-3.5" aria-hidden />, prefix: "Model flag · not a finding" },
  "human-confirmed": { box: "bg-mint-pale", eyebrow: "text-teal-800", icon: <CheckCircle2 className="size-3.5" aria-hidden />, prefix: "Human-confirmed" },
  info: { box: "bg-tint", eyebrow: "text-teal-800", icon: <Info className="size-3.5" aria-hidden />, prefix: "Note" },
};

/**
 * Evidence callout. The eyebrow states what kind of statement this is, so a
 * detector flag is never mistaken for a human finding. Text is ink on a pale
 * fill (at least 8:1); the icon and the words carry the meaning, not the colour.
 */
export function Callout({ variant, by, label, children, className }: {
  variant: CalloutVariant;
  /** Who confirmed it (human-confirmed) or what produced it (model-flag), shown after the prefix. */
  by?: ReactNode;
  /** Replaces the default eyebrow text. */
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const v = VARIANTS[variant];
  return (
    <aside role="note" data-variant={variant} className={cn("rounded-md px-4 py-3.5 text-[13px] leading-relaxed text-ink", v.box, className)}>
      <p className={cn("mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase", v.eyebrow)}>
        {v.icon}
        <span>{label ?? v.prefix}{by ? <> · {by}</> : null}</span>
      </p>
      <div>{children}</div>
    </aside>
  );
}
