import { Check, ChevronDown, Download, Flag, MapPin, Paperclip, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Donut } from "@/components/data-display/Donut";
import { Heatmap } from "@/components/data-display/Heatmap";
import { SchematicMap } from "@/components/data-display/SchematicMap";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { HeroAction } from "@/components/shell/Hero";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { CommandPalette } from "@/components/ui/command-palette";
import { DropdownMenu, Popover } from "@/components/ui/menu-popover";
import { Drawer, Modal } from "@/components/ui/overlay";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { DisabledReason, Tooltip } from "@/components/ui/tooltip";
import { useSession } from "@/hooks/useSession";
import "./preview.css";

/** One row of states: each cell is labelled with the state it shows. */
function States({ items, tone }: { items: [string, ReactNode][]; tone?: "dark" }) {
  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
      {items.map(([label, node]) => (
        <div key={label} className="min-w-0"><p className="pv-state-label" style={tone === "dark" ? { color: "#CADDE2" } : undefined}>{label}</p>{node}</div>
      ))}
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line-strong bg-white p-5" aria-label={title} role="region">
      <h3 className="text-[17px]">{title}</h3>
      {note && <p className="mb-3 text-xs text-ink-2">{note}</p>}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** A static copy of an open menu, using the same classes as the live one. */
function MenuReplica({ items, label }: { items: { label: string; hover?: boolean; disabled?: string; danger?: boolean; checked?: boolean }[]; label?: string }) {
  return (
    <div className="iris-menu w-60" aria-hidden>
      {label && <p className="iris-menu-label">{label}</p>}
      {items.map((it) => (
        <div key={it.label} data-force={it.hover ? "hover" : undefined} data-disabled={it.disabled ? "" : undefined}
          className={`iris-menu-item items-start ${it.danger ? "text-critical-ink" : ""}`}>
          <span className="inline-flex size-4 items-center justify-center">{it.checked && <Check className="size-4" />}</span>
          <span><span className="block">{it.label}</span>{it.disabled && <span className="block text-xs text-ink-2">{it.disabled}</span>}</span>
        </div>
      ))}
    </div>
  );
}

const Boom = () => { throw new Error("Preview: a component failed to render."); };

export function ComponentStates() {
  const { meta } = useSession();
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [sim, setSim] = useState(false);
  const [step, setStep] = useState(1);
  const [donutSel, setDonutSel] = useState<string | null>(null);
  const [cell, setCell] = useState<{ row: string; column: string } | null>({ row: "RHU-TALA-2", column: "39" });
  const [mapSel, setMapSel] = useState<string | null>("RHU-TALA-2");
  const [crash, setCrash] = useState(false);
  const units = (meta?.units ?? []).filter((u) => u.unit_type !== "hub");

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Buttons" note="Default, hover, focus and disabled. Tab through the live buttons to see the real focus ring.">
        <States items={[
          ["Primary", <Button>Open INV</Button>],
          ["Hover", <Button data-force="hover">Open INV</Button>],
          ["Focus", <Button data-force="focus">Open INV</Button>],
          ["Disabled", <Button disabled>Open INV</Button>],
        ]} />
        <States items={[
          ["Secondary", <Button variant="secondary">View source</Button>],
          ["Hover", <Button variant="secondary" data-force="hover">View source</Button>],
          ["Focus", <Button variant="secondary" data-force="focus">View source</Button>],
          ["Disabled with reason (Tab to it)", <DisabledReason reason="Attach evidence and record a confirmed finding first."><Button disabled>Resolve investigation</Button></DisabledReason>],
        ]} />
        <div className="rounded-md bg-nav p-4">
          <States tone="dark" items={[
            ["Hero action", <HeroAction icon={<Download className="size-4" aria-hidden />}>Export view</HeroAction>],
            ["Hover", <span data-force="hover" className="iris-hero__action"><Download className="size-4" aria-hidden />Export view</span>],
            ["Focus", <span data-force="focus" className="iris-hero__action" style={{ outlineColor: "#FFFFFF" }}><Download className="size-4" aria-hidden />Export view</span>],
            ["Disabled", <HeroAction disabled icon={<Download className="size-4" aria-hidden />}>Export view</HeroAction>],
          ]} />
        </div>
      </Card>

      <Card title="Callouts" note="The eyebrow states what kind of statement it is.">
        <Callout variant="model-flag" by="Zero-case run">Three consecutive zero-case submissions. The detector raised a review; no cause has been established.</Callout>
        <Callout variant="human-confirmed" by="RESU analyst">Submission receipt and unit identity confirmed. The zero count still awaits source-register verification.</Callout>
        <Callout variant="info">Relationships are reporting routes, not disease transmission.</Callout>
      </Card>

      <Card title="Menus and popovers" note="Live triggers, plus static open copies so the open state can be compared.">
        <States items={[
          ["Live menu", <DropdownMenu groups={[{ items: [{ label: "Reassign", icon: <UserPlus aria-hidden />, onSelect: () => {} }, { label: "Add note", icon: <Paperclip aria-hidden />, onSelect: () => {} }] },
            { label: "Not available", items: [{ label: "Change priority", icon: <Flag aria-hidden />, onSelect: () => {}, disabled: true, hint: "Priority is set by the detector" }] }]} />],
          ["Live popover", <Popover title="Week range" trigger={<button type="button" className="iris-filter-chip"><MapPin aria-hidden />Popover</button>}><p className="text-xs text-ink-2">Small form or picker content.</p></Popover>],
        ]} />
        <States items={[
          ["Open (hover on second item)", <MenuReplica items={[{ label: "Reassign" }, { label: "Add note", hover: true }, { label: "Change priority", disabled: "Priority is set by the detector" }, { label: "Close as not a problem", danger: true }]} />],
          ["Open radio menu", <MenuReplica label="Disease" items={[{ label: "Dengue", checked: true }, { label: "Leptospirosis", hover: true }, { label: "Measles" }]} />],
        ]} />
        <States items={[
          ["Chip", <span className="iris-filter-chip"><ChevronDown aria-hidden />All reporting units</span>],
          ["Hover", <span className="iris-filter-chip" data-force="hover"><ChevronDown aria-hidden />All reporting units</span>],
          ["Open", <span className="iris-filter-chip" data-force="open"><ChevronDown aria-hidden />All reporting units</span>],
          ["Focus", <span className="iris-filter-chip" data-force="focus"><ChevronDown aria-hidden />All reporting units</span>],
        ]} />
      </Card>

      <Card title="Modal, drawer and command palette" note="Open each one; Escape closes it and focus returns to the button.">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setModal(true)}>Open modal</Button>
          <Button variant="secondary" onClick={() => setDrawer(true)}>Open drawer</Button>
          <Button variant="secondary" onClick={() => setPalette(true)}>Find a unit (Ctrl K)</Button>
        </div>
        {picked && <p className="text-xs text-ink-2">Palette chose: <span className="font-medium text-ink">{picked}</span></p>}
        <Modal title="Send reminder (preview)" description="Simulated: no message is sent." open={modal} onOpenChange={setModal}
          footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button onClick={() => setModal(false)}>Record reminder</Button></>}>
          <p className="text-sm">Modal body. Below 640 px it becomes a bottom sheet.</p>
        </Modal>
        <Drawer title="Dataset (preview)" description="Schema, sample rows, checksum and lineage go here." open={drawer} onOpenChange={setDrawer}
          footer={<Button variant="secondary" onClick={() => setDrawer(false)}>Close</Button>}>
          <p className="text-sm">Drawer body.</p>
        </Drawer>
        <CommandPalette open={palette} onOpenChange={setPalette} title="Find a unit" placeholder="Search units by name or ID"
          items={units.map((u) => ({ id: u.id, label: u.name, group: u.province, keywords: u.municipality ?? "" }))} onSelect={(i) => setPicked(`${i.label} (${i.id})`)} />
        <States items={[
          ["Tooltip (hover or focus)", <Tooltip content="Updated from the backend snapshot."><Button variant="ghost">Hover me</Button></Tooltip>],
          ["Tooltip, shown", <span className="inline-block rounded-md bg-[#04121C] px-2.5 py-1.5 text-xs text-white">Updated from the backend snapshot.</span>],
        ]} />
      </Card>

      <Card title="Stepper and switches">
        <Stepper steps={[{ label: "Units and weeks" }, { label: "Reason" }, { label: "Owner" }, { label: "Review" }]} current={step} onStepClick={setStep} />
        <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button><Button size="sm" disabled={step === 3} onClick={() => setStep((s) => s + 1)}>Next</Button></div>
        <Switch label="Include simulated inputs" description="Excluded from live flag generation." checked={sim} onCheckedChange={setSim} />
        <Switch label="Human verification required" description="Before any finding or resolution." checked locked="Always on: every flag needs a person to confirm it." />
        <Switch label="Disabled switch" description="Not available for this role." checked={false} disabled />
      </Card>

      <Card title="Error boundary" note="Contains a failure in one part of a screen.">
        <Button variant="secondary" className="self-start" onClick={() => setCrash((c) => !c)}>{crash ? "Restore" : "Make the sample fail"}</Button>
        <ErrorBoundary resetKey={String(crash)} title="This sample could not be shown">
          {crash ? <Boom /> : <p className="text-sm text-ink-2">Sample content renders normally.</p>}
        </ErrorBoundary>
      </Card>

      <Card title="Donut" note="Preview values. Click or press Enter on a segment or legend row; Tab reaches each segment.">
        <Donut title="Every submission counts (preview)" centerValue={15} centerLabel="received" selectedKey={donutSel} onSelect={(k) => setDonutSel((s) => (s === k ? null : k))}
          note="Zero-case submissions count toward completeness; missing ones do not."
          segments={[
            { key: "reported", label: "With cases", value: 11, color: "var(--color-chart-reported)" },
            { key: "zero", label: "Zero cases", value: 4, color: "var(--color-chart-zero)" },
            { key: "missing", label: "Missing", value: 3, color: "var(--color-chart-missing)" },
            { key: "blank", label: "Blank count", value: 1, color: "", pattern: "hatch" },
          ]} />
      </Card>

      <Card title="Heatmap" note="Preview rows. Each state has its own text; the selected cell has a ring.">
        <Heatmap caption="Submission history (preview)" selected={cell} onSelect={(row, column) => setCell({ row, column })}
          columns={["35", "36", "37", "38", "39", "40"].map((w) => ({ key: w, label: `W${w}` }))}
          rows={[
            { key: "RHU-TALA-2", label: "Tala RHU II", emphasis: true, cells: [["35", "reported", 4], ["36", "reported", 5], ["37", "reported", 2], ["38", "zero", 0], ["39", "zero", 0], ["40", "zero", 0]].map(([c, s, v]) => ({ column: c as string, state: s as "reported", value: v as number })) },
            { key: "RHU-SILANGAN", label: "Silangan RHU", cells: [["35", "reported", 3], ["36", "missing", null], ["37", "reported", 6], ["38", "blank", null], ["39", "reported", 2], ["40", "missing", null]].map(([c, s, v]) => ({ column: c as string, state: s as "reported", value: v as number | null })) },
            { key: "LAB-REG", label: "Regional laboratory", cells: [{ column: "40", state: "reported", value: 12 }] },
          ]} />
      </Card>

      <Card title="Schematic map" note="Fictional outlines and preview markers. Missing is hollow, blank is dashed; Tab reaches each marker.">
        <SchematicMap title="Reporting coverage (preview)" selectedId={mapSel} onSelect={setMapSel}
          provinces={[{ name: "Masagana", outline: [[330, 95], [560, 115], [605, 250], [525, 365], [380, 345], [305, 220]] },
            { name: "Malaya", outline: [[540, 380], [705, 375], [765, 470], [705, 595], [580, 585], [515, 480]] }]}
          points={[{ id: "HUB-MSG", label: "Masagana hub", x: 420, y: 150, state: "hub" }, { id: "RHU-TALA-2", label: "Tala RHU II", x: 535, y: 230, state: "zero" },
            { id: "RHU-AMIHAN", label: "Amihan RHU", x: 365, y: 255, state: "reported" }, { id: "RHU-SILANGAN", label: "Silangan RHU", x: 640, y: 540, state: "missing" },
            { id: "RHU-LUNTIAN", label: "Luntian RHU", x: 560, y: 500, state: "blank" }]} />
      </Card>
    </div>
  );
}
