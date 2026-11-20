import type { ReactNode } from "react";
import { useSession } from "@/hooks/useSession";
import type { SectionKey } from "@/lib/navigation";
import { Hero } from "./Hero";
import { SCREENS, updatedLabel } from "./ScreenHeader";
import { SectionTabs } from "./SectionTabs";

/**
 * The photo banner for a page inside a section (a concern, Plan actions, Real dengue data, Recovery):
 * the section's photo and colours with the page's own words, then the section's tabs.
 */
export function PageHero({ section, eyebrow, title, subtitle, actions, tabs = true, tour }: {
  section: Exclude<SectionKey, "system">;
  eyebrow: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tabs?: boolean;
  /** data-tour marker for the guided tour. */
  tour?: string;
}) {
  const { meta } = useSession();
  const s = SCREENS[section];
  return (
    <div className="mb-[25px] flex flex-col gap-[25px]" data-tour={tour}>
      <Hero size="compact" variant={s.variant} photo={s.photo} position={s.position} zoom={s.zoom} eyebrow={eyebrow} title={title}
        subtitle={subtitle} updated={updatedLabel(meta?.as_of)} actions={actions} />
      {tabs && <SectionTabs section={section} />}
    </div>
  );
}
