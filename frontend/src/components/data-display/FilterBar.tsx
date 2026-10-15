import * as D from "@radix-ui/react-dialog";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SheetContent } from "@/components/ui/dialog";
import { useIsMdUp } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

/**
 * Filters stay out of the way until needed: a "Filters" button reveals them
 * inline on larger screens and in a side sheet on phones. Values live in the
 * parent, so hiding the controls never loses input. `primary` (e.g. a search
 * box) is always shown.
 */
export function FilterBar({ children, activeCount, onReset, label = "Filters", extra, primary, defaultOpen = false }: {
  children: ReactNode; activeCount: number; onReset: () => void; label?: string; extra?: ReactNode; primary?: ReactNode; defaultOpen?: boolean;
}) {
  const md = useIsMdUp();
  const [open, setOpen] = useState(defaultOpen);
  const toggle = (
    <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn(!md && "flex-1")}>
      <SlidersHorizontal aria-hidden /> {label === "Filters" ? "Filters" : label}
      {activeCount > 0 && <span className="rounded-sm bg-teal-900 px-1.5 text-xs text-white">{activeCount}</span>}
    </Button>
  );
  const reset = activeCount > 0 && (
    <Button variant="ghost" onClick={onReset}><RotateCcw aria-hidden /> Clear filters</Button>
  );
  if (md) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          {primary}
          {toggle}
          {reset}
          {extra && <div className="ml-auto flex items-end gap-2">{extra}</div>}
        </div>
        {open && (
          <div role="group" aria-label={label} className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-white p-3">
            {children}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {primary}
      <div className="flex flex-wrap items-center gap-2">
        <D.Root open={open} onOpenChange={setOpen}>
          <D.Trigger asChild>{toggle}</D.Trigger>
          <SheetContent title={label}>
            <div className="flex flex-col gap-4 p-5">{children}</div>
            <div className="sticky bottom-0 flex gap-2 border-t border-line bg-white p-4">
              <Button variant="secondary" className="flex-1" onClick={onReset} disabled={activeCount === 0}>Clear</Button>
              <Button className="flex-1" onClick={() => setOpen(false)}>Show results</Button>
            </div>
          </SheetContent>
        </D.Root>
        {reset}
        {extra}
      </div>
    </div>
  );
}

export function FilterField({ label, children, className }: { label: string; children: (id: string) => ReactNode; className?: string }) {
  const id = `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className={className ?? "w-full md:w-44"}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-2">{label}</label>
      {children(id)}
    </div>
  );
}

/** Row of toggle chips for the most common filter (e.g. status). */
export function ChipFilter<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; count?: number; tone?: "critical" }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="-mx-1 flex flex-wrap gap-1.5 px-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} type="button" aria-pressed={active} onClick={() => onChange(o.value)}
            className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium sm:min-h-8",
              active ? "border-teal-900 bg-teal-900 text-white" : "border-line-strong bg-white text-ink hover:border-teal-900",
              !active && o.tone === "critical" && "text-critical-ink")}>
            {o.label}
            {o.count !== undefined && <span className={cn("tabular", active ? "text-aqua-50" : "text-ink-2", !active && o.tone === "critical" && "text-critical-ink")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
