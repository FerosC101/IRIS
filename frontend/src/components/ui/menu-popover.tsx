import * as Menu from "@radix-ui/react-dropdown-menu";
import * as P from "@radix-ui/react-popover";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface MenuAction {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** Shown under the label, e.g. why an action is disabled. */
  hint?: string;
}

/**
 * Popover menu of actions (Radix DropdownMenu): arrow keys move, Enter
 * selects, Escape closes and returns focus to the trigger. Items may be
 * grouped; a group label is announced with its items.
 */
export function DropdownMenu({ label = "More actions", items, groups, trigger, align = "end" }: {
  label?: string; items?: MenuAction[]; groups?: { label?: string; items: MenuAction[] }[]; trigger?: ReactNode; align?: "start" | "end";
}) {
  const all = groups ?? [{ items: items ?? [] }];
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        {trigger ?? <Button variant="secondary"><MoreHorizontal aria-hidden /> {label} <ChevronDown aria-hidden /></Button>}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="iris-menu" align={align} sideOffset={6} aria-label={label}>
          {all.map((g, gi) => (
            <Menu.Group key={g.label ?? gi}>
              {gi > 0 && <Menu.Separator className="iris-menu-sep" />}
              {g.label && <Menu.Label className="iris-menu-label">{g.label}</Menu.Label>}
              {g.items.map((it) => (
                <Menu.Item key={it.label} disabled={it.disabled} onSelect={it.onSelect}
                  className={cn("iris-menu-item items-start", it.danger && "text-critical-ink")}>
                  <span className="mt-0.5 shrink-0 [&_svg]:size-4">{it.icon}</span>
                  <span className="min-w-0">
                    <span className="block">{it.label}</span>
                    {it.hint && <span className="block text-xs text-ink-2">{it.hint}</span>}
                  </span>
                </Menu.Item>
              ))}
            </Menu.Group>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Popover for small forms and pickers anchored to a trigger (the week-range picker uses the same pattern). */
export function Popover({ trigger, children, title, align = "start", open, onOpenChange, className }: {
  trigger: ReactNode; children: ReactNode; title?: string; align?: "start" | "center" | "end";
  open?: boolean; onOpenChange?: (o: boolean) => void; className?: string;
}) {
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content className={cn("iris-menu p-4", className)} align={align} sideOffset={6} aria-label={title}>
          {title && <p className="mb-2 text-sm font-semibold">{title}</p>}
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
