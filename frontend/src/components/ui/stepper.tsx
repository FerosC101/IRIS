import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Step { label: string; description?: ReactNode }

/**
 * Numbered steps for a multi-step flow (new investigation, CSV import). Steps
 * before `current` are complete and can be revisited when `onStepClick` is set;
 * later steps are not reachable until earlier ones are done.
 */
export function Stepper({ steps, current, onStepClick, orientation = "horizontal", label = "Progress", className }: {
  steps: Step[]; current: number; onStepClick?: (index: number) => void; orientation?: "horizontal" | "vertical"; label?: string; className?: string;
}) {
  return (
    <ol aria-label={label} className={cn("flex gap-2", orientation === "vertical" ? "flex-col" : "flex-col sm:flex-row", className)}>
      {steps.map((s, i) => {
        const state = i < current ? "complete" : i === current ? "current" : "upcoming";
        const body = (
          <>
            <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
              state === "complete" && "border-teal-800 bg-teal-800 text-white",
              state === "current" && "border-teal-800 bg-white text-teal-800",
              state === "upcoming" && "border-line-strong bg-white text-ink-2")}>
              {state === "complete" ? <Check className="size-4" /> : i + 1}
            </span>
            <span className="min-w-0 text-left">
              <span className={cn("block text-[13px] font-medium", state === "upcoming" ? "text-ink-2" : "text-ink")}>{s.label}</span>
              {s.description && <span className="block text-xs text-ink-2">{s.description}</span>}
              <span className="sr-only">{state === "complete" ? " (completed)" : state === "current" ? " (current step)" : " (not started)"}</span>
            </span>
          </>
        );
        return (
          <li key={s.label} aria-current={state === "current" ? "step" : undefined} className={cn("flex flex-1 items-start gap-2.5 border-t-2 pt-2.5",
            state === "upcoming" ? "border-line" : "border-teal-800")}>
            {state === "complete" && onStepClick
              ? <button type="button" onClick={() => onStepClick(i)} className="-m-1 flex items-start gap-2.5 rounded-md p-1 hover:bg-tint">{body}</button>
              : body}
          </li>
        );
      })}
    </ol>
  );
}
