import type { ReactNode } from "react";
import type { Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

const TONES: Record<Tone, string> = {
  neutral: "bg-porcelain text-ink-2 ring-line",
  critical: "bg-critical-bg text-critical-ink ring-critical/20",
  attention: "bg-attention-bg text-attention-ink ring-attention/25",
  info: "bg-info-bg text-info-ink ring-info/20",
  positive: "bg-positive-bg text-positive-ink ring-positive/20",
  teal: "bg-info-bg text-info-ink ring-info/30",
};

/** Small status label. Always carries text, never colour alone. */
export function Badge({ tone = "neutral", children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cn("iris-badge inline-flex max-w-full items-center gap-1 text-xs leading-5 ring-1 ring-inset [&_svg]:size-3.5", TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

const DOT: Record<Tone, string> = {
  neutral: "bg-ink-2/50", critical: "bg-critical", attention: "bg-attention", info: "bg-info", positive: "bg-positive", teal: "bg-teal-900",
};

/** Lighter-weight label: a coloured dot followed by text. */
export function DotLabel({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] text-ink", className)}>
      <span className={cn("size-2 shrink-0 rounded-full", DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}
