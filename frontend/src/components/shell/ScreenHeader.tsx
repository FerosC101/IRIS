import { Download, Plus, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { PhotoKey } from "@/assets";
import { Tooltip } from "@/components/ui/tooltip";
import { useGlobalFilters } from "@/hooks/useGlobalFilters";
import { useSession } from "@/hooks/useSession";
import type { SectionKey } from "@/lib/navigation";
import { GlobalFilterBar, type FilterBarSlots } from "./GlobalFilterBar";
import { Hero, HeroAction, type HeroVariant } from "./Hero";
import { SectionTabs } from "./SectionTabs";

type Screen = Exclude<SectionKey, "system">;

interface ScreenCopy {
  variant: HeroVariant;
  photo: PhotoKey;
  position: string;
  zoom?: number;
  eyebrow: string;
  title: string;
  subtitle: (disease: string) => string;
}

/** Mockup copy. Real place names are replaced by the fictional geography; "models" by detection methods. */
export const SCREENS: Record<Screen, ScreenCopy> = {
  dashboard: {
    variant: "bright", photo: "stethoscope", position: "60% 50%",
    eyebrow: "Surveillance overview", title: "A clearer signal. A faster response.",
    subtitle: (d) => `${d} surveillance across the simulated reporting network. Review gaps, verify signals and coordinate the next action.`,
  },
  reports: {
    variant: "deep", photo: "maskedCloseup", position: "62% 46%", zoom: 1.12,
    eyebrow: "Evidence workspace", title: "From report to understanding.",
    subtitle: () => "Explore submitted reports and missing records separately. Review the evidence before taking action.",
  },
  network: {
    variant: "deep", photo: "orWindow", position: "50% 50%",
    eyebrow: "Network intelligence", title: "See the connections behind the signal.",
    subtitle: () => "Follow reporting relationships, inspect submission gaps and compare connected units without assuming a shared cause.",
  },
  investigations: {
    variant: "deep", photo: "maskedCloseup", position: "62% 46%", zoom: 1.12,
    eyebrow: "Response workspace", title: "Evidence first. Action with confidence.",
    subtitle: () => "Coordinate verification, document human-confirmed findings and track corrective actions through resolution.",
  },
  data: {
    variant: "deep", photo: "orWindow", position: "50% 50%",
    eyebrow: "Data foundation / Pipeline & governance", title: "Trust starts with traceable data.",
    subtitle: () => "Inspect datasets, separate observations from simulations and monitor the detection methods that support human decisions.",
  },
};

/** "2026-10-08T09:00:00" -> "Updated 08 Oct 2026 · 09:00 PHT" (backend times are PHT). */
export function updatedLabel(asOf: string | undefined): string | undefined {
  const m = asOf?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const month = new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleString("en-GB", { month: "short" });
  return `Updated ${m[3]} ${month} ${m[1]} · ${m[4]}:${m[5]} PHT`;
}

function ScreenAction({ screen }: { screen: Screen }) {
  const nav = useNavigate();
  const { can } = useSession();
  switch (screen) {
    case "dashboard":
      return <HeroAction icon={<Download className="size-4" aria-hidden />} onClick={() => window.print()} title="Print or save this view as PDF">Export view</HeroAction>;
    case "reports":
      return <HeroAction icon={<Download className="size-4" aria-hidden />} onClick={() => window.print()} title="Print or save this view as PDF">Export reports</HeroAction>;
    case "network":
      return <HeroAction icon={<Download className="size-4" aria-hidden />} onClick={() => window.print()} title="Print or save this view as PDF">Export network</HeroAction>;
    case "investigations":
      if (!can("concern.assign")) return null;
      return (
        <Tooltip content="Opening an investigation from here arrives with the Investigations screen.">
          <span tabIndex={0} className="inline-flex rounded-[4px]"><HeroAction icon={<Plus className="size-4" aria-hidden />} disabled aria-disabled>New investigation</HeroAction></span>
        </Tooltip>
      );
    case "data":
      if (!can("dataset.import")) return null;
      return <HeroAction icon={<Upload className="size-4" aria-hidden />} onClick={() => nav("/data/import")}>Import dataset</HeroAction>;
  }
}

/** Hero + global filter bar + section tabs for the five main screens. */
/** `filterBar` lets a screen hide shared filters that do not apply and add its own sections to the same bar. */
export function ScreenHeader({ screen, eyebrowDetail, children, filterBar }: { screen: Screen; eyebrowDetail?: string; children?: ReactNode; filterBar?: FilterBarSlots }) {
  const { meta } = useSession();
  const { filters, categories } = useGlobalFilters();
  const s = SCREENS[screen];
  const disease = categories.find((c) => c.code === filters.disease)?.name ?? "Disease";
  const region = filters.region || "Simulated region";
  const eyebrow = eyebrowDetail ? `${s.eyebrow} / ${eyebrowDetail}` : screen === "dashboard" ? `${s.eyebrow} / ${region}` : s.eyebrow;
  return (
    <div className="flex flex-col gap-[25px]">
      <Hero variant={s.variant} photo={s.photo} position={s.position} zoom={s.zoom} eyebrow={eyebrow} title={s.title} subtitle={s.subtitle(disease)}
        updated={updatedLabel(meta?.as_of)} actions={<ScreenAction screen={screen} />} />
      <GlobalFilterBar {...filterBar} />
      <SectionTabs section={screen} />
      {children}
    </div>
  );
}
