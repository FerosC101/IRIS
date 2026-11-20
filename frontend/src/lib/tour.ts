import type { Role } from "@/types/api";

/**
 * Guided tour steps. Each step opens a page and points at an element marked `data-tour="<target>"`.
 * `route: "first-concern"` opens the highest-priority open concern the user can see, so the tour never
 * depends on a fixed concern id. Steps whose target never appears are skipped.
 */
export interface TourStep { route: string; target: string; title: string; body: string }

const DASHBOARD: TourStep[] = [
  { route: "/", target: "dash-summary", title: "This week in one line", body: "How many of the expected reports arrived, and how many concerns need a look." },
  { route: "/", target: "dash-kpis", title: "Headline numbers", body: "Each one is compared with the week before. The small line shows the last 12 weeks." },
  { route: "/", target: "dash-trend", title: "Twelve weeks of reporting", body: "Shaded weeks are shared problems IRIS found, such as a hub outage." },
];

const ANALYST: TourStep[] = [
  ...DASHBOARD,
  { route: "/", target: "dash-units", title: "Every unit, this week", body: "Teal: all reports arrived. Red: reports that never arrived. Click a tile to find it on the network." },
  { route: "/", target: "dash-queue", title: "Work queue", body: "Concerns and actions, overdue first. Open one to review it." },
  { route: "first-concern", target: "concern-chart", title: "Why it was flagged", body: "Reported cases against what the unit's recent weeks predict. The red bar is the flagged week." },
  { route: "first-concern", target: "concern-next", title: "What to do next", body: "One button moves the concern forward. Nothing is closed without a person and evidence." },
  { route: "/network", target: "network-graph", title: "Reporting network", body: "Units report through hubs and send specimens to labs. Red rings went quiet this week." },
  { route: "/network", target: "network-provinces", title: "Where the gaps cluster", body: "Several red dots in one province or behind one hub can mean one shared cause and one fix." },
  { route: "/investigations/plan", target: "plan-budget", title: "Plan with the hours you have", body: "Each block is an action, sized by its hours. IRIS picks the set that recovers the most reports." },
  { route: "/reports/dengue", target: "real-weeks", title: "Same models, real DOH data", body: "Zero-case dengue reports per week in 2020. Dark bars are high priority." },
  { route: "/reports/dengue", target: "real-leads", title: "Leads to check", body: "Each row shows the zero that was reported against the cases expected. A lead, not a confirmed error." },
  { route: "/reports/recovery", target: "recovery-actions", title: "Did reporting come back?", body: "Arrivals before the problem, during it and after each fix. A person records the result." },
];

const RHU: TourStep[] = [
  { route: "/", target: "dash-summary", title: "Your unit this week", body: "How many of your expected reports arrived, and what you still need to send." },
  { route: "/", target: "dash-tasks", title: "Your to-do list", body: "Missing reports to submit and questions from your coordinator to answer." },
  { route: "/", target: "dash-queue", title: "Concerns about your unit", body: "Open one to see why it was raised and reply." },
];

const ADMIN: TourStep[] = [
  ...DASHBOARD,
  { route: "/network", target: "network-graph", title: "Reporting network", body: "Units report through hubs and send specimens to labs. Red rings went quiet this week." },
  { route: "/reports/dengue", target: "real-weeks", title: "Real DOH data", body: "Zero-case dengue reports per week in 2020. Dark bars are high priority." },
  { route: "/reports/recovery", target: "recovery-actions", title: "Did reporting come back?", body: "Arrivals before the problem, during it and after each fix." },
];

const REAL: TourStep[] = [
  { route: "/reports/dengue", target: "real-hero", title: "Real data only", body: "This account sees the public HDX / DOH dengue data, 2016–2021, and nothing from the simulated demo region." },
  { route: "/reports/dengue", target: "real-weeks", title: "Zero reports each week", body: "Dark bars are zero-case reports the models rank as most likely to hide a reporting problem. Click a week." },
  { route: "/reports/dengue", target: "real-leads", title: "Leads to check", body: "Each row shows the zero that was reported against the cases expected. Open one to record what you found." },
  { route: "/reports/dengue", target: "real-tabs", title: "More views", body: "Low counts from Model A, a weekly checking plan, and how well the models did on known errors." },
];

export function tourFor(role: Role): TourStep[] {
  switch (role) {
    case "rhu_staff": return RHU;
    case "admin": return ADMIN;
    case "real_data": return REAL;
    default: return ANALYST;
  }
}
