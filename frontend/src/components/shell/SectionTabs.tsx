import { Link, useLocation } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { navItemFor, sectionTabs, type SectionKey } from "@/lib/navigation";

/** Pages inside one top-level section (for example Queue, Plan actions, Follow-up). Hidden when the role has only one. */
export function SectionTabs({ section }: { section: SectionKey }) {
  const { role } = useSession();
  const loc = useLocation();
  if (!role) return null;
  const tabs = sectionTabs(section, role);
  if (tabs.length < 2) return null;
  const active = navItemFor(loc.pathname)?.to;
  return (
    <nav aria-label="Section pages" className="iris-section-tabs">
      {tabs.map((t) => (
        <Link key={t.to} to={t.to} aria-current={active === t.to ? "page" : undefined} className="iris-section-tab">
          {t.tabLabel ?? t.label}
        </Link>
      ))}
    </nav>
  );
}
