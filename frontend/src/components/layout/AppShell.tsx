import * as D from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { ErrorState, Loading } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { DemoBanner } from "./DemoBanner";
import { Logo } from "./Logo";
import { RoleSelector } from "./RoleSelector";
import { NavList, Sidebar } from "./Sidebar";

function MobileTopBar() {
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky top-0 z-40 flex h-14 items-center justify-between bg-teal-900 px-3 lg:hidden">
      <Logo />
      <D.Root open={open} onOpenChange={setOpen}>
        <D.Trigger asChild>
          <button type="button" className="flex size-11 items-center justify-center rounded-md text-white hover:bg-white/10" aria-label="Open navigation menu">
            <Menu className="size-6" aria-hidden />
          </button>
        </D.Trigger>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-teal-900/50" />
          <D.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col bg-teal-900 shadow-md">
            <D.Title className="sr-only">Navigation</D.Title>
            <D.Description className="sr-only">Main navigation and demo role selector</D.Description>
            <div className="flex h-14 items-center justify-between px-3">
              <Logo />
              <D.Close className="flex size-11 items-center justify-center rounded-md text-white hover:bg-white/10" aria-label="Close navigation menu">
                <X className="size-6" aria-hidden />
              </D.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              <NavList onNavigate={() => setOpen(false)} />
            </div>
            <div className="space-y-3 border-t border-white/10 px-4 py-4">
              <RoleSelector onChanged={() => setOpen(false)} />
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>
    </div>
  );
}

export function AppShell() {
  const { isLoading, error, refetch } = useSession();
  const loc = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <div className="flex min-h-dvh bg-porcelain">
      <a href="#main" className="sr-only z-[70] rounded bg-white px-3 py-2 text-sm text-teal-900 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to main content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <DemoBanner />
        <main id="main" ref={main} tabIndex={-1} className="mx-auto w-full max-w-[90rem] min-w-0 flex-1 px-4 py-5 focus:outline-none sm:px-6 lg:px-8 lg:py-6">
          {isLoading ? <Loading label="Starting IRIS" /> : error ? (
            <div className="mx-auto max-w-xl py-10"><ErrorState error={error} onRetry={refetch} title="IRIS could not connect to its server" /></div>
          ) : <Suspense fallback={<Loading label="Loading page" />}><Outlet /></Suspense>}
        </main>
      </div>
    </div>
  );
}

export { RoleSelector };
