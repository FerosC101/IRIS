import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { EmptyState } from "@/components/ui/states";
import { useSession } from "@/hooks/useSession";
import { ROLE_LABELS } from "@/lib/labels";
import { NAV, canAccess } from "@/lib/navigation";
import { RoleSelector } from "./RoleSelector";

export function RouteGuard({ children }: { children: ReactNode }) {
  const { role } = useSession();
  const loc = useLocation();
  if (!role || canAccess(loc.pathname, role)) return <>{children}</>;
  const item = NAV.find((n) => n.to !== "/" && loc.pathname.startsWith(n.to));
  return (
    <div className="mx-auto max-w-lg py-10">
      <EmptyState icon={<Lock className="size-5" aria-hidden />} title={`${item?.label ?? "This page"} is not available for ${ROLE_LABELS[role]}`}>
        <p>Available to: {item?.roles.map((r) => ROLE_LABELS[r]).join(", ")}.</p>
        <div className="mt-4 text-left"><RoleSelector tone="light" /></div>
      </EmptyState>
    </div>
  );
}
