import * as T from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = T.Provider;

/** Short hint on hover and keyboard focus. Disabled buttons are wrapped so the hint still reaches keyboard users. */
export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root delayDuration={200}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-[70] max-w-[18rem] rounded-md bg-[#04121C] px-2.5 py-1.5 text-xs leading-snug text-white shadow-md">
          {content}
          <T.Arrow className="fill-[#04121C]" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

/**
 * A disabled action that says why. Disabled buttons get no focus or pointer
 * events, so the wrapper takes focus and carries the reason as its description
 * (announced by screen readers, shown as a tooltip on hover or focus).
 */
export function DisabledReason({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <Tooltip content={reason}>
      <span tabIndex={0} className="inline-flex rounded-md">{children}<span className="sr-only"> ({reason})</span></span>
    </Tooltip>
  );
}
