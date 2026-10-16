import * as T from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export const TabsContent = ({ value, children, className }: { value: string; children: ReactNode; className?: string }) => (
  <T.Content value={value} className={cn("pt-4 focus-visible:outline-none", className)}>{children}</T.Content>
);

export function TabsList({ tabs, className, label }: { tabs: { value: string; label: ReactNode }[]; className?: string; label: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <T.List aria-label={label} className={cn("flex min-w-max gap-1 border-b border-line", className)}>
        {tabs.map((t) => (
          <T.Trigger key={t.value} value={t.value}
            className="-mb-px min-h-11 border-b-2 border-transparent px-3 text-sm font-medium text-ink-2 hover:text-brand-light data-[state=active]:border-brand-bright data-[state=active]:text-brand-light sm:min-h-10">
            {t.label}
          </T.Trigger>
        ))}
      </T.List>
    </div>
  );
}
