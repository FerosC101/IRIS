import { Suspense, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { ErrorState, Loading } from "@/components/ui/states";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSession } from "@/hooks/useSession";
import { ErrorBoundary } from "./ErrorBoundary";
import { Footer } from "./Footer";
import { TopNav } from "./TopNav";

export function AppShell() {
  const { isLoading, error, refetch } = useSession();
  const loc = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col bg-page">
        <a href="#main" className="sr-only z-[70] rounded bg-white px-3 py-2 text-sm text-teal-900 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Skip to main content
        </a>
        <TopNav />
        <main id="main" ref={main} tabIndex={-1} className="iris-container min-w-0 flex-1 pt-6 focus:outline-none xl:pt-[37px]">
          {isLoading ? <Loading label="Starting IRIS" /> : error ? (
            <div className="mx-auto max-w-xl py-10"><ErrorState error={error} onRetry={refetch} title="IRIS could not connect to its server" /></div>
          ) : <ErrorBoundary resetKey={loc.pathname}><Suspense fallback={<Loading label="Loading page" />}><Outlet /></Suspense></ErrorBoundary>}
        </main>
        <Footer />
      </div>
    </TooltipProvider>
  );
}
