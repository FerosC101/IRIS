import * as Menu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { Building2, CalendarDays, Check, ChevronDown, ListFilter, MapPin, RotateCcw, Search, Stethoscope } from "lucide-react";
import { forwardRef, useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { UNIT_GROUP_LABELS, useGlobalFilters, weekRangeLabel, type UnitGroup } from "@/hooks/useGlobalFilters";
import { cn } from "@/lib/utils";

/**
 * A filter bar that reads as one: a "Filters" lead-in, then labelled sections (label above,
 * current value below, a chevron). A section whose value differs from its default is marked,
 * and Reset returns every section to its default.
 */

type SegmentProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactNode; value: ReactNode; changed?: boolean };

/** The trigger for one filter section; Radix menus and popovers wrap it with asChild. */
export const FilterSegment = forwardRef<HTMLButtonElement, SegmentProps>(({ label, icon, value, changed, className, ...p }, ref) => (
  <button ref={ref} type="button" {...p} className={cn("iris-filter-seg", changed && "iris-filter-seg--changed", className)}>
    <span className="iris-filter-seg__label">{icon}{label}</span>
    <span className="iris-filter-seg__value">
      {changed && <span className="iris-filter-seg__dot" aria-hidden />}
      <span className="truncate">{value}</span>
      <ChevronDown className="iris-filter-seg__chev" aria-hidden />
    </span>
  </button>
));
FilterSegment.displayName = "FilterSegment";

/** One choice from a list. */
export function ChoiceFilter<T extends string>({ label, icon, value, options, onChange, defaultValue = "" as T }: {
  label: string; icon: ReactNode; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; defaultValue?: T;
}) {
  const current = options.find((o) => o.value === value)?.label ?? "";
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <FilterSegment label={label} icon={icon} value={current} changed={value !== defaultValue} aria-label={`${label}: ${current}`} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="iris-menu" align="start" sideOffset={6}>
          <Menu.Label className="iris-menu-label">{label}</Menu.Label>
          <Menu.RadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
            {options.map((o) => (
              <Menu.RadioItem key={o.value || "all"} value={o.value} className="iris-menu-item">
                <span className="inline-flex size-4 items-center justify-center"><Menu.ItemIndicator><Check className="size-4" aria-hidden /></Menu.ItemIndicator></span>
                {o.label}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Several choices from a list; "All" when every option is on. */
export function MultiFilter<T extends string>({ label, icon, values, options, onChange }: {
  label: string; icon: ReactNode; values: Set<T>; options: { value: T; label: string }[]; onChange: (v: Set<T>) => void;
}) {
  const all = values.size === options.length;
  const current = all ? "All" : values.size === 0 ? "None" : options.filter((o) => values.has(o.value)).map((o) => o.label).join(", ");
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <FilterSegment label={label} icon={icon} value={current} changed={!all} aria-label={`${label}: ${current}`} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="iris-menu" align="start" sideOffset={6}>
          <Menu.Label className="iris-menu-label">{label}</Menu.Label>
          {options.map((o) => (
            <Menu.CheckboxItem key={o.value} className="iris-menu-item" checked={values.has(o.value)} onSelect={(e) => e.preventDefault()}
              onCheckedChange={(on) => { const n = new Set(values); if (on) n.add(o.value); else n.delete(o.value); onChange(n); }}>
              <span className="inline-flex size-4 items-center justify-center rounded-[3px] border border-line-strong">
                <Menu.ItemIndicator><Check className="size-3.5" aria-hidden /></Menu.ItemIndicator>
              </span>
              {o.label}
            </Menu.CheckboxItem>
          ))}
          <Menu.Separator className="iris-menu-sep" />
          <Menu.Item className="iris-menu-item" disabled={all} onSelect={() => onChange(new Set(options.map((o) => o.value)))}>Select all</Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Free-text search shown as a section of the bar. */
export function SearchFilter({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  const id = useId();
  return (
    <div className={cn("iris-filter-seg iris-filter-seg--search", value && "iris-filter-seg--changed")}>
      <label htmlFor={id} className="iris-filter-seg__label"><Search aria-hidden />{label}</label>
      <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="iris-filter-seg__input" />
    </div>
  );
}

function WeekRange() {
  const { filters, set, weeks } = useGlobalFilters();
  const [open, setOpen] = useState(false);
  const fromId = useId();
  const toId = useId();
  const last = weeks.length ? weeks[weeks.length - 1].week : 0;
  const quick = (n: number) => { set({ from: Math.max(0, filters.to - n + 1) }); };
  const label = weekRangeLabel(weeks, filters.from, filters.to);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <FilterSegment label="ISO weeks" icon={<CalendarDays aria-hidden />} value={label} changed={filters.from !== last || filters.to !== last} aria-label={`ISO week range: ${label}`} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="iris-menu w-[19rem] p-4" align="start" sideOffset={6}>
          <p className="text-sm font-semibold">ISO weeks</p>
          <p className="mt-0.5 text-xs text-ink-2">Monday to Sunday, on the dataset's calendar.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={fromId} className="mb-1 block text-xs font-medium">From</label>
              <Select id={fromId} value={filters.from} onChange={(e) => set({ from: Number(e.target.value) })}>
                {weeks.filter((w) => w.week <= filters.to).map((w) => <option key={w.week} value={w.week}>ISO W{w.iso_week}</option>)}
              </Select>
            </div>
            <div>
              <label htmlFor={toId} className="mb-1 block text-xs font-medium">To</label>
              <Select id={toId} value={filters.to} onChange={(e) => { const to = Number(e.target.value); set({ to, from: Math.min(filters.from, to) }); }}>
                {weeks.map((w) => <option key={w.week} value={w.week}>ISO W{w.iso_week}</option>)}
              </Select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => set({ from: last, to: last })}>Latest week</Button>
            <Button size="sm" variant="secondary" onClick={() => quick(4)}>Last 4 weeks</Button>
            <Button size="sm" variant="secondary" onClick={() => quick(6)}>Last 6 weeks</Button>
          </div>
          <Popover.Close asChild><Button size="sm" className="mt-4 w-full">Done</Button></Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export type GlobalFilterKey = "region" | "disease" | "weeks" | "group";

export interface FilterBarSlots {
  /** Screen-wide filters that do not apply on this screen. */
  hide?: GlobalFilterKey[];
  /** The screen's own filter sections, shown after the shared ones. */
  extra?: ReactNode;
  /** How many of the screen's own filters differ from their defaults, and how to reset them. */
  extraChanged?: number;
  onResetExtra?: () => void;
  /** Shown at the right end, e.g. a view switch. */
  trailing?: ReactNode;
}

/** Region, disease, ISO week range and unit group for the current screen, plus the screen's own filters. Values live in the URL. */
export function GlobalFilterBar({ className, hide = [], extra, extraChanged = 0, onResetExtra, trailing }: FilterBarSlots & { className?: string }) {
  const { filters, set, categories, provinces, weeks } = useGlobalFilters();
  const last = weeks.length ? weeks[weeks.length - 1].week : 0;
  const defaultDisease = categories.find((c) => c.code === "DENGUE")?.code ?? categories[0]?.code ?? "";
  const shown = (k: GlobalFilterKey) => !hide.includes(k);
  const changed = (shown("region") && filters.region ? 1 : 0) + (shown("disease") && filters.disease !== defaultDisease ? 1 : 0)
    + (shown("weeks") && (filters.from !== last || filters.to !== last) ? 1 : 0) + (shown("group") && filters.group ? 1 : 0) + extraChanged;
  const reset = () => { set({ region: "", disease: "", from: undefined, to: undefined, group: "" }); onResetExtra?.(); };
  // A screen that uses none of the shared filters and has none of its own shows no bar at all.
  if ((["region", "disease", "weeks", "group"] as const).every((k) => !shown(k)) && !extra && !trailing) return null;
  return (
    <div role="group" aria-label="Screen filters" className={cn("iris-filterbar", className)}>
      <div className="iris-filterbar__lead">
        <ListFilter aria-hidden />
        <span>Filters</span>
        {changed > 0 && <span className="iris-filterbar__count" aria-label={`${changed} changed`}>{changed}</span>}
      </div>
      <div className="iris-filterbar__segments">
        {shown("region") && (
          <ChoiceFilter label="Region" icon={<MapPin aria-hidden />} value={filters.region} onChange={(region) => set({ region })}
            options={[{ value: "", label: "All provinces" }, ...provinces.map((p) => ({ value: p, label: p }))]} />
        )}
        {shown("disease") && (
          <ChoiceFilter label="Disease" icon={<Stethoscope aria-hidden />} value={filters.disease} defaultValue={defaultDisease} onChange={(disease) => set({ disease })}
            options={categories.map((c) => ({ value: c.code, label: c.name }))} />
        )}
        {shown("weeks") && <WeekRange />}
        {shown("group") && (
          <ChoiceFilter<UnitGroup> label="Units" icon={<Building2 aria-hidden />} value={filters.group} onChange={(group) => set({ group })}
            options={(Object.keys(UNIT_GROUP_LABELS) as UnitGroup[]).map((g) => ({ value: g, label: UNIT_GROUP_LABELS[g] }))} />
        )}
        {extra}
      </div>
      <div className="iris-filterbar__end">
        {changed > 0 && <button type="button" className="iris-filterbar__reset" onClick={reset}><RotateCcw aria-hidden />Reset</button>}
        {trailing}
        <span className="iris-data-badge" title="Simulated region, synthetic demo data">Synthetic data</span>
      </div>
    </div>
  );
}
