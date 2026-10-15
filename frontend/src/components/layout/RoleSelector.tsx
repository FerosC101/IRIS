import { useId } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/useToast";
import { ROLE_LABELS } from "@/lib/labels";
import { canAccess } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/api";

/** Demo control for switching the acting user. Not authentication. */
export function RoleSelector({ tone = "dark", onChanged }: { tone?: "dark" | "light"; onChanged?: () => void }) {
  const { meta, userId, switchUser } = useSession();
  const id = useId();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  if (!meta) return null;
  const groups = (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ role: r, users: meta.users.filter((u) => u.role === r) }));
  return (
    <div>
      <label htmlFor={id} className={cn("mb-1 block text-[11px] font-semibold tracking-wide uppercase", tone === "dark" ? "text-aqua-50/70" : "text-ink-2")}>
        Viewing as
      </label>
      <select
        id={id}
        value={userId}
        onChange={(e) => {
          const user = meta.users.find((u) => u.id === e.target.value);
          switchUser(e.target.value);
          if (user && !canAccess(loc.pathname, user.role)) nav("/");
          toast(`Now viewing as ${user?.display_name ?? e.target.value}.`);
          onChanged?.();
        }}
        className={cn(
          "block min-h-11 w-full rounded-md border px-2.5 py-2 text-sm sm:min-h-10",
          tone === "dark" ? "border-white/20 bg-teal-800 text-white" : "border-line-strong bg-white text-ink",
        )}
      >
        {groups.map((g) => (
          <optgroup key={g.role} label={ROLE_LABELS[g.role]}>
            {g.users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
          </optgroup>
        ))}
      </select>
      <p className={cn("mt-1 text-[11px] leading-snug", tone === "dark" ? "text-aqua-50/60" : "text-ink-2")}>
        Demo switch to try other roles.
      </p>
    </div>
  );
}
