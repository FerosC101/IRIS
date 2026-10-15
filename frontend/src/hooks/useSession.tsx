import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { api } from "@/services/api";
import { activeUser, setDemoUser } from "@/services/client";
import type { Meta, Role } from "@/types/api";

interface Session {
  meta: Meta | undefined;
  isLoading: boolean;
  error: Error | null;
  role: Role | undefined;
  userId: string | undefined;
  can: (permission: string) => boolean;
  switchUser: (id: string) => void;
  unitName: (id: string | null | undefined) => string;
  categoryName: (code: string | null | undefined) => string;
  refetch: () => void;
}

const Ctx = createContext<Session | null>(null);
/** Exposed for tests that render components without a server. */
export const SessionContext = Ctx;

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["meta", activeUser()], queryFn: api.meta, staleTime: 60_000 });
  const meta = q.data;
  const switchUser = useCallback(
    (id: string) => {
      setDemoUser(id);
      qc.clear();
    },
    [qc],
  );
  const value = useMemo<Session>(() => {
    const units = new Map(meta?.units.map((u) => [u.id, u.name]));
    const cats = new Map(meta?.categories.map((c) => [c.code, c.name]));
    return {
      meta,
      isLoading: q.isLoading,
      error: q.error,
      role: meta?.actor.role,
      userId: meta?.actor.user_id,
      can: (p: string) => !!meta?.actor.permissions.includes(p),
      switchUser,
      unitName: (id) => (id ? (units.get(id) ?? id) : "—"),
      categoryName: (code) => (code ? (cats.get(code) ?? code) : "—"),
      refetch: () => void q.refetch(),
    };
  }, [meta, q, switchUser]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession must be used inside SessionProvider");
  return s;
}
