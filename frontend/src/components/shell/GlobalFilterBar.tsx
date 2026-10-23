import * as Menu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, Check, ChevronDown, MapPin, Stethoscope } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { UNIT_GROUP_LABELS, useGlobalFilters, weekRangeLabel, type UnitGroup } from "@/hooks/useGlobalFilters";

function RadioMenu<T extends string>({ label, icon, value, options, onChange, iconAfter = false }: {
  label: string; icon: ReactNode; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; iconAfter?: boolean;
}) {
  const current = options.find((o) => o.value === value)?.label ?? label;
  return (
    <Menu.Root>
      <Menu.Trigger className="iris-filter-chip" aria-label={`${label}: ${current}`}>
        {!iconAfter && icon}{current}{iconAfter && icon}
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

function WeekRange() {
  const { filters, set, weeks } = useGlobalFilters();
  const [open, setOpen] = useState(false);
  const fromId = useId();
  const toId = useId();
  const last = weeks.length ? weeks[weeks.length - 1].week : 0;
  const quick = (n: number) => { set({ from: Math.max(0, filters.to - n + 1) }); };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="iris-filter-chip" aria-label={`ISO week range: ${weekRangeLabel(weeks, filters.from, filters.to)}`}>
        <CalendarDays aria-hidden />{weekRangeLabel(weeks, filters.from, filters.to)}
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

/** Region, disease, ISO week range and unit group for the current screen. Values live in the URL. */
export function GlobalFilterBar({ className }: { className?: string }) {
  const { filters, set, categories, provinces } = useGlobalFilters();
  return (
    <div role="group" aria-label="Screen filters" className={className ? `iris-filterbar ${className}` : "iris-filterbar"}>
      <RadioMenu label="Region" icon={<MapPin aria-hidden />} value={filters.region} onChange={(region) => set({ region })}
        options={[{ value: "", label: "Simulated region · All provinces" }, ...provinces.map((p) => ({ value: p, label: `Simulated region · ${p}` }))]} />
      <RadioMenu label="Disease" icon={<Stethoscope aria-hidden />} value={filters.disease} onChange={(disease) => set({ disease })}
        options={categories.map((c) => ({ value: c.code, label: c.name }))} />
      <WeekRange />
      <RadioMenu<UnitGroup> label="Unit group" icon={<ChevronDown aria-hidden />} value={filters.group} onChange={(group) => set({ group })}
        options={(Object.keys(UNIT_GROUP_LABELS) as UnitGroup[]).map((g) => ({ value: g, label: UNIT_GROUP_LABELS[g] }))} />
      <span className="iris-data-badge">Synthetic demo data</span>
    </div>
  );
}
