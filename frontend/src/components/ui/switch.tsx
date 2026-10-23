import * as S from "@radix-ui/react-switch";
import { Lock } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * On/off setting with a visible label. `locked` keeps the value fixed and says
 * why (for example "Human verification required" is always on); a locked
 * switch is focusable so the reason reaches keyboard and screen-reader users.
 */
export function Switch({ label, description, checked, onCheckedChange, disabled, locked, className }: {
  label: ReactNode; description?: ReactNode; checked: boolean; onCheckedChange?: (v: boolean) => void;
  disabled?: boolean; locked?: ReactNode; className?: string;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  const fixed = disabled || !!locked;
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-[13px] font-medium text-ink">{label}</label>
        {(description || locked) && (
          <p id={descId} className="mt-0.5 text-xs text-ink-2">
            {description}
            {locked && <span className="mt-0.5 flex items-center gap-1"><Lock className="size-3" aria-hidden />{locked}</span>}
          </p>
        )}
      </div>
      <S.Root id={id} checked={checked} onCheckedChange={fixed ? undefined : onCheckedChange} disabled={disabled}
        aria-readonly={locked ? true : undefined} aria-describedby={description || locked ? descId : undefined}
        className={cn("relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
          checked ? "border-data bg-data" : "border-line-strong bg-flow",
          fixed ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:border-teal-800")}>
        <S.Thumb className={cn("block size-[18px] rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-[22px]" : "translate-x-[2px]")} />
      </S.Root>
    </div>
  );
}
