import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy } from "react";
import { createBrowserRouter, RouterProvider, type RouteObject } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { RouteGuard } from "@/components/layout/RouteGuard";
import { OverviewPage } from "@/features/overview/OverviewPage";
import { PreferencesProvider } from "@/hooks/usePreferences";
import { SessionProvider } from "@/hooks/useSession";
import { ToastProvider } from "@/hooks/useToast";
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
const RecoveryPage = lazy(() => import("@/features/recovery/RecoveryPage").then((x) => ({ default: x.RecoveryPage })));
const HelpPage = lazy(() => import("@/features/settings/HelpPage").then((x) => ({ default: x.HelpPage })));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage").then((x) => ({ default: x.SettingsPage })));

const guard = (el: React.ReactNode) => <RouteGuard>{el}</RouteGuard>;

export const routes: RouteObject[] = [
  {
    element: <SessionProvider><AppShell /></SessionProvider>,
    children: [
      { path: "/", element: <OverviewPage /> },
      { path: "/investigations", element: guard(<InvestigationsPage />) },
      { path: "/investigations/:id", element: guard(<InvestigationPage />) },
      { path: "/anomalies", element: guard(<AnomalyPage />) },
      { path: "/network", element: guard(<NetworkPage />) },
      { path: "/data", element: guard(<DataExplorerPage />) },
      { path: "/data/import", element: <RouteGuard><ImportWizard /></RouteGuard> },
      { path: "/planner", element: guard(<PlannerPage />) },
      { path: "/follow-up", element: guard(<FollowUpPage />) },
      { path: "/recovery", element: guard(<RecoveryPage />) },
      { path: "/evaluation", element: guard(<EvaluationPage />) },
      { path: "/data-management", element: guard(<DataManagementPage />) },
      { path: "/data-management/:id", element: guard(<DatasetPage />) },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/help", element: <HelpPage /> },
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
