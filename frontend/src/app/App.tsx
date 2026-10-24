import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, type ReactNode } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useLocation, useParams, type RouteObject } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { RouteGuard } from "@/components/layout/RouteGuard";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { OverviewPage } from "@/features/overview/OverviewPage";
import { PreferencesProvider } from "@/hooks/usePreferences";
import { SessionProvider } from "@/hooks/useSession";
import { ToastProvider } from "@/hooks/useToast";
import type { SectionKey } from "@/lib/navigation";
import { ApiError } from "@/services/client";
import { NotFound } from "./NotFound";

// Route pages load on demand so the graph and chart libraries are not in the first download.
const DataExplorerPage = lazy(() => import("@/features/data-explorer/DataExplorerPage").then((x) => ({ default: x.DataExplorerPage })));
const DataManagementPage = lazy(() => import("@/features/data-management/DataManagementPage").then((x) => ({ default: x.DataManagementPage })));
const DatasetPage = lazy(() => import("@/features/data-management/DatasetPage").then((x) => ({ default: x.DatasetPage })));
const ImportWizard = lazy(() => import("@/features/data-management/ImportWizard").then((x) => ({ default: x.ImportWizard })));
const EvaluationPage = lazy(() => import("@/features/evaluation/EvaluationPage").then((x) => ({ default: x.EvaluationPage })));
const FollowUpPage = lazy(() => import("@/features/interventions/FollowUpPage").then((x) => ({ default: x.FollowUpPage })));
const PlannerPage = lazy(() => import("@/features/interventions/PlannerPage").then((x) => ({ default: x.PlannerPage })));
const InvestigationPage = lazy(() => import("@/features/investigations/InvestigationPage").then((x) => ({ default: x.InvestigationPage })));
const InvestigationsPage = lazy(() => import("@/features/investigations/InvestigationsPage").then((x) => ({ default: x.InvestigationsPage })));
const AnomalyPage = lazy(() => import("@/features/investigations/AnomalyPage").then((x) => ({ default: x.AnomalyPage })));
const NetworkPage = lazy(() => import("@/features/network/NetworkPage").then((x) => ({ default: x.NetworkPage })));
const RealDenguePage = lazy(() => import("@/features/real-data/RealDenguePage").then((x) => ({ default: x.RealDenguePage })));
const RecoveryPage = lazy(() => import("@/features/recovery/RecoveryPage").then((x) => ({ default: x.RecoveryPage })));
const HelpPage = lazy(() => import("@/features/settings/HelpPage").then((x) => ({ default: x.HelpPage })));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage").then((x) => ({ default: x.SettingsPage })));
// Development only: removed from production builds, where import.meta.env.DEV is false.
const DesignPreviewPage = import.meta.env.DEV
  ? lazy(() => import("@/features/design-preview/DesignPreviewPage").then((x) => ({ default: x.DesignPreviewPage })))
  : null;

const guard = (el: ReactNode) => <RouteGuard>{el}</RouteGuard>;

/** A secondary page inside a section: the section's tabs, then the page. */
function SectionPage({ section, children }: { section: SectionKey; children: ReactNode }) {
  return (
    <RouteGuard>
      <div className="mb-5"><SectionTabs section={section} /></div>
      {children}
    </RouteGuard>
  );
}

/** Old addresses keep working: same query string and hash, new path. */
function Moved({ to }: { to: string | ((p: Record<string, string | undefined>) => string) }) {
  const loc = useLocation();
  const params = useParams();
  const path = typeof to === "string" ? to : to(params);
  return <Navigate to={`${path}${loc.search}${loc.hash}`} replace />;
}

export const routes: RouteObject[] = [
  {
    element: <SessionProvider><AppShell /></SessionProvider>,
    children: [
      { path: "/", element: <OverviewPage /> },

      { path: "/reports", element: guard(<DataExplorerPage />) },
      { path: "/reports/analysis", element: <SectionPage section="reports"><AnomalyPage /></SectionPage> },
      { path: "/reports/dengue", element: <SectionPage section="reports"><RealDenguePage /></SectionPage> },
      { path: "/reports/recovery", element: <SectionPage section="reports"><RecoveryPage /></SectionPage> },

      { path: "/network", element: guard(<NetworkPage />) },

      { path: "/investigations", element: guard(<InvestigationsPage />) },
      { path: "/investigations/plan", element: <SectionPage section="investigations"><PlannerPage /></SectionPage> },
      { path: "/investigations/follow-up", element: <SectionPage section="investigations"><FollowUpPage /></SectionPage> },
      { path: "/investigations/:id", element: <SectionPage section="investigations"><InvestigationPage /></SectionPage> },

      { path: "/data", element: guard(<DataManagementPage />) },
      { path: "/data/import", element: <SectionPage section="data"><ImportWizard /></SectionPage> },
      { path: "/data/evaluation", element: <SectionPage section="data"><EvaluationPage /></SectionPage> },
      { path: "/data/datasets/:id", element: <SectionPage section="data"><DatasetPage /></SectionPage> },

      { path: "/settings", element: <SettingsPage /> },
      { path: "/help", element: <HelpPage /> },
      ...(DesignPreviewPage ? [{ path: "/design-preview", element: <DesignPreviewPage /> }] : []),

      // Addresses from before the redesign.
      { path: "/anomalies", element: <Moved to="/reports/analysis" /> },
      { path: "/recovery", element: <Moved to="/reports/recovery" /> },
      { path: "/planner", element: <Moved to="/investigations/plan" /> },
      { path: "/follow-up", element: <Moved to="/investigations/follow-up" /> },
      { path: "/evaluation", element: <Moved to="/data/evaluation" /> },
      { path: "/data-management", element: <Moved to="/data" /> },
      { path: "/data-management/:id", element: <Moved to={(p) => `/data/datasets/${p.id ?? ""}`} /> },

      { path: "*", element: <NotFound /> },
    ],
  },
];

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

const queryClient = makeQueryClient();
const router = createBrowserRouter(routes);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}
