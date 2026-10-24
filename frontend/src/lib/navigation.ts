import type { Role } from "@/types/api";

export type SectionKey = "dashboard" | "reports" | "network" | "investigations" | "data" | "system";

export interface NavItem {
  to: string;
  label: string;
  /** Label inside the section's tab row; defaults to label. */
  tabLabel?: string;
  section: SectionKey;
  /** One of the five tabs in the top navigation. */
  top?: boolean;
  roles: Role[];
  description: string;
}

const ALL: Role[] = ["rhu_staff", "provincial_coordinator", "resu_analyst", "admin"];
const REVIEWERS: Role[] = ["provincial_coordinator", "resu_analyst"];

export const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", section: "dashboard", top: true, roles: ALL, description: "What needs attention this week" },
  { to: "/reports", label: "Reports & Analysis", tabLabel: "Weekly reports", section: "reports", top: true, roles: ALL, description: "Submitted reports and missing records" },
  { to: "/reports/analysis", label: "Anomaly analysis", section: "reports", roles: REVIEWERS, description: "Detection results and evidence" },
  { to: "/reports/dengue", label: "Real dengue data", section: "reports", roles: [...REVIEWERS, "admin"], description: "Model A and B on real DOH dengue reports" },
  { to: "/reports/recovery", label: "Recovery", section: "reports", roles: [...REVIEWERS, "admin"], description: "Is reporting improving?" },
  { to: "/network", label: "Reporting Network", section: "network", top: true, roles: [...REVIEWERS, "admin"], description: "How units are connected" },
  { to: "/investigations", label: "Investigations & Actions", tabLabel: "Investigation queue", section: "investigations", top: true, roles: ["rhu_staff", ...REVIEWERS], description: "Verification and corrective actions" },
  { to: "/investigations/plan", label: "Plan actions", section: "investigations", roles: REVIEWERS, description: "Decide what to fix first" },
  { to: "/investigations/follow-up", label: "Follow-up", section: "investigations", roles: ["rhu_staff", ...REVIEWERS], description: "Actions in progress" },
  { to: "/data", label: "Data & Models", tabLabel: "Datasets & detection", section: "data", top: true, roles: ["resu_analyst", "admin"], description: "Datasets, pipeline and detection methods" },
  { to: "/data/import", label: "Import dataset", section: "data", roles: ["resu_analyst", "admin"], description: "Map, validate and import a CSV" },
  { to: "/data/evaluation", label: "Evaluation", section: "data", roles: ["resu_analyst", "admin"], description: "Synthetic evaluation of the detection methods" },
  { to: "/settings", label: "Settings", section: "system", roles: ALL, description: "Role and display" },
  { to: "/help", label: "Help", section: "system", roles: ALL, description: "Terms and limitations" },
];

/** The most specific nav item for a path (longest matching prefix). */
export function navItemFor(path: string): NavItem | undefined {
  return [...NAV].sort((a, b) => b.to.length - a.to.length)
    .find((n) => (n.to === "/" ? path === "/" : path === n.to || path.startsWith(n.to + "/")));
}

/** Route-level access. The API still checks every action's permission. */
export function canAccess(path: string, role: Role): boolean {
  const item = navItemFor(path);
  return item ? item.roles.includes(role) : true;
}

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role));
}

export function topNavFor(role: Role): NavItem[] {
  return NAV.filter((n) => n.top && n.roles.includes(role));
}

/** Tabs within a section that this role can open. */
export function sectionTabs(section: SectionKey, role: Role): NavItem[] {
  return NAV.filter((n) => n.section === section && section !== "system" && n.roles.includes(role));
}

export function sectionFor(path: string): SectionKey | undefined {
  return navItemFor(path)?.section;
}
