import type { LucideIcon } from "lucide-react";
import { Activity, ClipboardCheck, Database, FlaskConical, HelpCircle, Home, ListChecks, Network, Search, Settings, Table2 } from "lucide-react";
import type { Role } from "@/types/api";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** "main" items are always visible; "more" items sit in a collapsible group. */
  group: "main" | "more";
  description: string;
}

const ALL: Role[] = ["rhu_staff", "provincial_coordinator", "resu_analyst", "admin"];

export const NAV: NavItem[] = [
  { to: "/", label: "Home", icon: Home, roles: ALL, group: "main", description: "What needs attention" },
  { to: "/investigations", label: "Investigations", icon: Search, roles: ["rhu_staff", "provincial_coordinator", "resu_analyst"], group: "main", description: "Reporting problems to review" },
  { to: "/planner", label: "Plan actions", icon: ListChecks, roles: ["provincial_coordinator", "resu_analyst"], group: "main", description: "Decide what to fix first" },
  { to: "/follow-up", label: "Track actions", icon: ClipboardCheck, roles: ["rhu_staff", "provincial_coordinator", "resu_analyst"], group: "main", description: "Actions in progress" },
  { to: "/anomalies", label: "Anomaly Analysis", icon: Activity, roles: ["provincial_coordinator", "resu_analyst"], group: "main", description: "Analyze reporting signals and evidence" },
  { to: "/network", label: "Reporting Network", icon: Network, roles: ["provincial_coordinator", "resu_analyst", "admin"], group: "main", description: "How units are connected" },
  { to: "/recovery", label: "Recovery", icon: Activity, roles: ["provincial_coordinator", "resu_analyst", "admin"], group: "main", description: "Is reporting improving?" },
  { to: "/data", label: "Data", icon: Table2, roles: ALL, group: "main", description: "Browse the records" },
  { to: "/evaluation", label: "Model evaluation", icon: FlaskConical, roles: ["resu_analyst", "admin"], group: "more", description: "How well detection works" },
  { to: "/data-management", label: "Data sources", icon: Database, roles: ["resu_analyst", "admin"], group: "more", description: "Datasets, imports and units" },
  { to: "/settings", label: "Settings", icon: Settings, roles: ALL, group: "more", description: "Role and display" },
  { to: "/help", label: "Help", icon: HelpCircle, roles: ALL, group: "more", description: "Terms and limitations" },
];

/** Route prefixes that require a nav item's roles. */
export function canAccess(path: string, role: Role): boolean {
  const item = [...NAV].sort((a, b) => b.to.length - a.to.length).find((n) => (n.to === "/" ? path === "/" : path === n.to || path.startsWith(n.to + "/")));
  return item ? item.roles.includes(role) : true;
}

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role));
}
