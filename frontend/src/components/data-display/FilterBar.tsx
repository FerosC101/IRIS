import { ListFilter, RotateCcw, Search } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A screen's own filters, drawn like the shared filter bar: a "Filters" lead-in, then one labelled
 * section per filter, then Reset. `primary` (a search box) is the first section. On phones the
 * sections fall into two columns. Values live in the parent.
 */
export function FilterBar({ children, activeCount, onReset, label = "Filters", extra, primary }: {
  children: ReactNode; activeCount: number; onReset: () => void; label?: string; extra?: ReactNode; primary?: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="iris-filterbar">
      <div className="iris-filterbar__lead">
        <ListFilter aria-hidden />
        <span>Filters</span>
        {activeCount > 0 && <span className="iris-filterbar__count" aria-label={`${activeCount} changed`}>{activeCount}</span>}
      </div>
      <div className="iris-filterbar__segments">
        {primary && (
          <div className="iris-filter-seg iris-filter-seg--field md:min-w-64">
            <span className="iris-filter-seg__label" aria-hidden><Search />Search</span>
            {primary}
          </div>
        )}
        {children}
      </div>
      {(activeCount > 0 || extra) && (
        <div className="iris-filterbar__end">
          {activeCount > 0 && <button type="button" className="iris-filterbar__reset" onClick={onReset}><RotateCcw aria-hidden />Reset</button>}
          {extra}
        </div>
      )}
    </div>
  );
}

/** One labelled section of a FilterBar; the control is rendered by the caller with the given id. */
export function FilterField({ label, children, className }: { label: string; children: (id: string) => ReactNode; className?: string }) {
  const id = `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className={cn("iris-filter-seg iris-filter-seg--field", className ?? "md:min-w-44")}>
      <label htmlFor={id} className="iris-filter-seg__label">{label}</label>
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
