import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { ROLE_LABELS } from "@/lib/labels";
import { navFor, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { RoleSelector } from "./RoleSelector";

function Item({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <li>
      <NavLink
        to={item.to}
        end={item.to === "/"}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn("flex min-h-11 items-center gap-3 rounded-md px-3 text-[15px] text-aqua-50/90 hover:bg-white/8 hover:text-white lg:min-h-10",
            isActive && "bg-teal-700 font-medium text-white hover:bg-teal-700")
        }
      >
        <item.icon className="size-[18px] shrink-0" aria-hidden />
        {item.label}
      </NavLink>
    </li>
  );
}

export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { role } = useSession();
  const loc = useLocation();
  const items = role ? navFor(role) : [];
  const more = items.filter((i) => i.group === "more");
  const inMore = more.some((i) => loc.pathname.startsWith(i.to));
  const [open, setOpen] = useState(inMore);
  if (!role) return null;
  return (
    <nav aria-label="Main" className="flex flex-col gap-3">
      <ul className="flex flex-col gap-0.5">{items.filter((i) => i.group === "main").map((i) => <Item key={i.to} item={i} onNavigate={onNavigate} />)}</ul>
      {more.length > 0 && (
        <div>
          <button type="button" aria-expanded={open || inMore} onClick={() => setOpen((o) => !o)}
            className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-[13px] font-medium text-aqua-50/70 hover:text-white lg:min-h-9">
            More
            <ChevronDown className={cn("size-4 transition-transform", (open || inMore) && "rotate-180")} aria-hidden />
          </button>
          {(open || inMore) && <ul className="flex flex-col gap-0.5">{more.map((i) => <Item key={i.to} item={i} onNavigate={onNavigate} />)}</ul>}
        </div>
      )}
    </nav>
  );
}

export function UserCard() {
  const { meta } = useSession();
  if (!meta) return null;
  const a = meta.actor;
  return (
    <div className="text-xs text-aqua-50/80">
      <p className="font-medium text-white">{a.display_name}</p>
      <p>{ROLE_LABELS[a.role]}{a.province ? ` · ${a.province}` : ""}</p>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col bg-teal-900 lg:flex">
      <div className="px-4 pt-5 pb-5">
        <Logo />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <NavList />
      </div>
      <div className="space-y-3 border-t border-white/10 px-4 py-4">
        <RoleSelector />
      </div>
    </aside>
  );
}
