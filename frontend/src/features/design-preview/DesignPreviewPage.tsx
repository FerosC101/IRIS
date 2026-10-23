import { ArrowUpRight, Check, Download, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { BRAND, PHOTOS, type PhotoKey } from "@/assets";
import { Logo } from "@/components/layout/Logo";
import { GlobalFilterBar } from "@/components/shell/GlobalFilterBar";
import { Hero, HeroAction } from "@/components/shell/Hero";
import { PhotoSurface } from "@/components/shell/PhotoSurface";
import { SCREENS, updatedLabel } from "@/components/shell/ScreenHeader";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { ComponentStates } from "./ComponentStates";

/**
 * Development-only gallery of the shell components (registered only when
 * import.meta.env.DEV). Text inside the photo-surface samples is the mockup
 * copy, marked as preview; it is not data.
 */
function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div>
        <h2 className="text-[19px]">{title}</h2>
        {note && <p className="text-[13px] text-ink-2">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const SWATCHES: [string, string][] = [
  ["page", "#F7F9F9"], ["surface", "#FFFFFF"], ["tint", "#E7F1F2"], ["flow", "#E0E7E8"], ["nav / ink", "#0A3A4A"], ["primary", "#0E6680"],
  ["data (large text)", "#1A9EA0"], ["mint (zero-case)", "#98E0D8"], ["mint-pale", "#B7ECE9"], ["series-2", "#7893A8"],
  ["missing (fill)", "#B65F59"], ["missing-pale", "#FCD3D0"], ["critical-ink", "#9B463F"], ["ink-2", "#4F6670"], ["line", "#DCE4E6"], ["line-strong", "#A9BAC0"],
];

export function DesignPreviewPage() {
  const { meta } = useSession();
  const updated = updatedLabel(meta?.as_of);
  return (
    <div className="flex flex-col gap-10 pb-4">
      <header>
        <p className="iris-eyebrow">Development only</p>
        <h1 className="iris-type-heading">Design preview</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">Shell components in every variant. The navigation and footer are the live ones above and below. This route is not part of the production build.</p>
      </header>

      <Block title="Brand" note={`Light surfaces use the supplied dark-teal mark; dark surfaces show the typeset wordmark${BRAND.onDark ? " and the light mark" : " until a transparent light mark is supplied"}.`}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="rounded-full bg-nav px-6 py-4"><Logo surface="dark" /></div>
          <div className="rounded-md border border-line-strong bg-white px-6 py-4"><Logo surface="light" /></div>
        </div>
      </Block>

      <Block title="Hero — the five screens" note="Raw photos in grayscale under the teal gradient; crop and zoom per screen.">
        {(Object.keys(SCREENS) as (keyof typeof SCREENS)[]).map((key) => {
          const s = SCREENS[key];
          return (
            <div key={key} className="flex flex-col gap-1.5">
              <p className="text-xs text-ink-2"><code>{key}</code> · variant <code>{s.variant}</code> · photo <code>{s.photo}</code> · position <code>{s.position}</code>{s.zoom ? <> · zoom <code>{s.zoom}</code></> : null}</p>
              <Hero variant={s.variant} photo={s.photo} position={s.position} zoom={s.zoom} eyebrow={s.eyebrow} title={s.title} subtitle={s.subtitle("Dengue")}
                updated={updated} actions={<HeroAction icon={<Download className="size-4" aria-hidden />}>Sample action</HeroAction>} />
            </div>
          );
        })}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-ink-2">Fallback: the gradient alone, as shown when a photo fails to load (deep and bright).</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <Hero variant="deep" photo="maskedCloseup" showPhoto={false} eyebrow="Fallback" title="Gradient only." subtitle="No photo is loaded." updated={updated} />
            <Hero variant="bright" photo="stethoscope" showPhoto={false} eyebrow="Fallback" title="Gradient only." subtitle="No photo is loaded." />
          </div>
        </div>
      </Block>

      <Block title="Global filter bar" note="Each menu writes to the URL (region, disease, from, to, group).">
        <GlobalFilterBar />
        <p className="text-xs text-ink-2">Section tabs (Investigations & Actions):</p>
        <SectionTabs section="investigations" />
      </Block>

      <Block title="Photo surfaces" note="Preview copy from the mockups. Every variant keeps its text at WCAG AA contrast.">
        <div className="grid gap-4 lg:grid-cols-2">
          <PhotoSurface variant="deep" photo="stethoscope" position="70% 40%" className="p-6">
            <p className="text-[11px] font-semibold tracking-wide text-[#98E0D8] uppercase">deep · pipeline strip</p>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
              {["Ingest", "Validate", "Analyze", "Human review", "Respond"].map((s, i) => (
                <div key={s}><p className="font-display text-[15px] font-medium">0{i + 1} / {s}</p><p className="mt-1 text-xs text-[#CADDE2]">Preview step</p></div>
              ))}
            </div>
          </PhotoSurface>
          <PhotoSurface variant="light" photo="stethoscope" position="60% 55%" className="p-6">
            <p className="text-[11px] font-semibold tracking-wide text-[#0E6680] uppercase">light · signal banner</p>
            <p className="mt-2 font-display text-[19px] font-medium">A pattern worth checking.</p>
            <p className="mt-1 text-xs text-[#0E6680]">Preview text · a flag is a prompt for review, not a finding</p>
          </PhotoSurface>
          <PhotoSurface variant="deep" photo="stethoscope" position="50% 70%" className="p-6">
            <p className="flex items-center gap-1.5 font-display text-[18px] font-medium text-[#98E0D8]"><Check className="size-5" aria-hidden /> Human-confirmed · preview</p>
            <p className="mt-2 text-sm">A reviewer confirmed receipt of the submission. The zero-case count still requires register verification.</p>
          </PhotoSurface>
          <PhotoSurface variant="deep" photo="stethoscope" position="40% 60%" className="p-6">
            <p className="text-[11px] font-semibold tracking-wide text-[#98E0D8] uppercase">deep · shared-disruption check</p>
            <p className="mt-2 text-[15px] font-medium">Peer units share a reporting relay.</p>
            <p className="mt-1 text-xs text-[#CADDE2]">Co-occurrence only. No shared outage or common cause has been verified.</p>
          </PhotoSurface>
          <PhotoSurface variant="teal" photo="orLight" position="50% 40%" className="flex flex-wrap items-center gap-4 p-5 lg:col-span-2">
            <div className="min-w-0 flex-1">
              <p className="font-display text-[19px] font-medium">Close the loop, not just the alert.</p>
              <p className="text-[13px]">Record source evidence and a human-reviewed finding before resolving.</p>
            </div>
            <Button variant="secondary">Attach evidence</Button>
            <Button disabled><Lock aria-hidden /> Resolve investigation</Button>
          </PhotoSurface>
        </div>
      </Block>

      <Block title="Shared components and their states" note="Hover, focus and open are forced on the labelled copies; the live components respond to the mouse and keyboard.">
        <ComponentStates />
      </Block>

      <Block title="Tokens">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {SWATCHES.map(([name, hex]) => (
            <li key={name} className="text-xs">
              <span className="block h-12 rounded-md border border-line-strong" style={{ background: hex }} aria-hidden />
              <span className="mt-1 block font-medium">{name}</span><span className="text-ink-2">{hex}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-baseline gap-6">
          <span className="font-display text-[42px] leading-none font-medium">Aa 42</span>
          <span className="font-display text-[19px] font-medium">Card title 19</span>
          <span className="iris-type-metric text-data">186</span>
          <span className="text-sm">Body 14</span>
          <span className="iris-eyebrow">Eyebrow 11</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost <ArrowUpRight aria-hidden /></Button>
          <Button variant="danger">Danger</Button><Button disabled>Disabled</Button>
          <Badge tone="info">Info</Badge><Badge tone="critical">Missing</Badge><Badge tone="attention">Attention</Badge><Badge tone="positive">Positive</Badge><Badge>Neutral</Badge>
        </div>
      </Block>

      <Block title="Photos" note="Supplied originals, untouched; resized AVIF/WebP copies with PNG fallback.">
        <ul className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(PHOTOS) as PhotoKey[]).map((k) => (
            <li key={k} className="rounded-md border border-line p-3"><p className="font-medium"><code>{k}</code></p><p className="text-ink-2">{PHOTOS[k].subject}</p><p className="text-ink-2">{PHOTOS[k].width}×{PHOTOS[k].height}</p></li>
          ))}
        </ul>
      </Block>
    </div>
  );
}
