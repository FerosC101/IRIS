import { Link } from "react-router-dom";
import { PageHeader } from "@/components/data-display/PageHeader";
import { RoleSelector } from "@/components/layout/RoleSelector";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { usePreferences } from "@/hooks/usePreferences";
import { useSession } from "@/hooks/useSession";
import { ROLE_LABELS } from "@/lib/labels";
import { navFor } from "@/lib/navigation";
import { ResetDemo } from "../data-management/ResetDemo";

export function SettingsPage() {
  const { meta, role } = useSession();
  const { prefs, setPref, reset } = usePreferences();
  return (
    <>
      <PageHeader title="Settings" description="Saved in this browser only." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Current demo role">
          <div className="flex flex-col gap-4">
            {meta && <p className="text-sm">You are viewing IRIS as <strong>{meta.actor.display_name}</strong> ({ROLE_LABELS[meta.actor.role]}{meta.actor.province ? `, ${meta.actor.province}` : ""}).</p>}
            <div className="max-w-sm"><RoleSelector tone="light" /></div>
            {role && <p className="text-[13px] text-ink-2">This role can open: {navFor(role).map((n) => n.label).join(", ")}.</p>}
            <p className="text-[13px] text-ink-2">The role selector is a prototype control. The server checks the selected role for each action, but anyone can choose any role, so this is not real access control.</p>
          </div>
        </Panel>
        <Panel title="Display">
          <div className="flex flex-col gap-4">
            <Field label="Table density">{(p) => <Select {...p} value={prefs.density} onChange={(e) => setPref("density", e.target.value as "comfortable" | "compact")}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></Select>}</Field>
            <Field label="Date format">{(p) => <Select {...p} value={prefs.dateStyle} onChange={(e) => setPref("dateStyle", e.target.value as "readable" | "iso")}><option value="readable">Readable (Oct 4, 2026)</option><option value="iso">ISO (2026-10-04)</option></Select>}</Field>
            <Checkbox label="Show the simulation answer key on investigations" description="Reveals the injected scenario behind each demo concern. Turn off to practise reviewing without it." checked={prefs.showAnswerKey} onChange={(v) => setPref("showAnswerKey", v)} />
          </div>
        </Panel>
        <Panel title="Accessibility">
          <div className="flex flex-col gap-4">
            <Checkbox label="Larger text" description="Increases the base text size by about 12%." checked={prefs.largeText} onChange={(v) => setPref("largeText", v)} />
            <Checkbox label="Reduce motion" description="Turns off the few transitions IRIS uses. Your system setting is also respected." checked={prefs.reduceMotion} onChange={(v) => setPref("reduceMotion", v)} />
            <Checkbox label="Underline all links" checked={prefs.underlineLinks} onChange={(v) => setPref("underlineLinks", v)} />
            <Checkbox label="Stronger focus indicator" description="A thicker outline around the focused control when using a keyboard." checked={prefs.strongFocus} onChange={(v) => setPref("strongFocus", v)} />
            <div><Button variant="secondary" size="sm" onClick={reset}>Restore default preferences</Button></div>
          </div>
        </Panel>
        <Panel title="Demo data">
          <div className="flex flex-col gap-3">
            <p className="text-sm">Regenerate the simulated dataset and discard every change made in this demo. To choose which scenarios are injected, use <Link className="font-medium text-teal-900 hover:underline" to="/data-management?tab=scenarios">Data sources → Demo scenarios</Link>.</p>
            <div><ResetDemo /></div>
          </div>
        </Panel>
        <Panel title="About IRIS" className="lg:col-span-2">
          <div className="flex flex-col gap-2 text-sm">
            <p><strong>IRIS — Integrated Reporting Intervention System.</strong> {meta?.app.tagline}</p>
            <p>{meta?.app.prototype_notice} It does not connect to any government system and is not endorsed by the Department of Health.</p>
            <p><Link className="font-medium text-teal-900 hover:underline" to="/help#limitations">Read the prototype and data limitations</Link>.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
