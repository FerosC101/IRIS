import * as D from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, HelpCircle, Info, Menu as MenuIcon, Settings, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/useToast";
import { ROLE_LABELS } from "@/lib/labels";
import { canAccess, sectionFor, topNavFor } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { Role } from "@/types/api";
import { Logo } from "./Logo";

/** Demo display names end in "(demo)"; the chip shows the name without it. */
export function shortName(name: string): string {
  return name.replace(/\s*\(demo\)\s*$/i, "");
}

export function initials(name: string): string {
  const words = shortName(name).split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

function useSwitchRole() {
  const { meta, switchUser } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  return (id: string) => {
    const user = meta?.users.find((u) => u.id === id);
    switchUser(id);
    if (user && !canAccess(loc.pathname, user.role)) nav("/");
    toast(`Now viewing as ${user ? shortName(user.display_name) : id} (demo role).`);
  };
}

function Tabs({ onNavigate, vertical = false }: { onNavigate?: () => void; vertical?: boolean }) {
  const { role } = useSession();
  const loc = useLocation();
  const current = sectionFor(loc.pathname);
  if (!role) return null;
  return (
    <ul className={cn("flex", vertical ? "flex-col gap-1" : "items-center gap-0.5")}>
      {topNavFor(role).map((item) => (
        <li key={item.to}>
          <Link to={item.to} onClick={onNavigate} aria-current={current === item.section ? "page" : undefined}
            className={cn("iris-nav-tab", vertical && "w-full")}>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function UserMenu() {
  const { meta, userId } = useSession();
  const switchRole = useSwitchRole();
  if (!meta) return null;
  const me = meta.actor;
  const groups = (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ role: r, users: meta.users.filter((u) => u.role === r) }));
  return (
    <Menu.Root>
      <Menu.Trigger className="flex min-h-11 items-center gap-2.5 rounded-full py-1 pr-2 pl-1 text-[13px] font-medium text-[#DCE5E7] hover:bg-white/8"
        aria-label={`Account menu: ${shortName(me.display_name)}, ${ROLE_LABELS[me.role]}`}>
        <span className="iris-avatar" aria-hidden>{initials(me.display_name)}</span>
        <span className="hidden max-w-[11rem] truncate xl:inline">{shortName(me.display_name)}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="iris-menu w-[19rem]" align="end" sideOffset={10}>
          <div className="px-2.5 pt-2 pb-2.5">
            <p className="text-sm font-semibold">{shortName(me.display_name)}</p>
            <p className="text-xs text-ink-2">{ROLE_LABELS[me.role]}{me.province ? ` · ${me.province}` : ""}</p>
          </div>
          <Menu.Separator className="iris-menu-sep" />
          <Menu.Label className="iris-menu-label">Demo role</Menu.Label>
          <p className="px-2.5 pb-1 text-xs text-ink-2">A demo switch to try other roles. It is not a sign-in.</p>
          <Menu.RadioGroup value={userId} onValueChange={switchRole}>
            {groups.filter((g) => g.users.length).map((g) => (
              <Menu.Group key={g.role}>
                <p className="px-2.5 pt-2 text-[11px] font-medium text-ink-2">{ROLE_LABELS[g.role]}</p>
                {g.users.map((u) => (
                  <Menu.RadioItem key={u.id} value={u.id} className="iris-menu-item">
                    <span className="inline-flex size-4 items-center justify-center"><Menu.ItemIndicator><Check className="size-4" aria-hidden /></Menu.ItemIndicator></span>
                    {shortName(u.display_name)}
                  </Menu.RadioItem>
                ))}
              </Menu.Group>
            ))}
          </Menu.RadioGroup>
          <Menu.Separator className="iris-menu-sep" />
          <Menu.Item asChild className="iris-menu-item"><Link to="/settings"><Settings className="size-4" aria-hidden />Settings and preferences</Link></Menu.Item>
          <Menu.Item asChild className="iris-menu-item"><Link to="/help"><HelpCircle className="size-4" aria-hidden />Help and glossary</Link></Menu.Item>
          <Menu.Item asChild className="iris-menu-item"><Link to="/help#limitations"><Info className="size-4" aria-hidden />About this demo</Link></Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { meta, userId } = useSession();
  const switchRole = useSwitchRole();
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger className="flex size-11 items-center justify-center rounded-full text-white hover:bg-white/10 lg:hidden" aria-label="Open navigation menu">
        <MenuIcon className="size-6" aria-hidden />
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-teal-900/50" />
        <D.Content className="iris-dark-scope fixed inset-y-0 right-0 z-50 flex w-[min(20rem,88vw)] flex-col shadow-md">
          <D.Title className="sr-only">Navigation</D.Title>
          <D.Description className="sr-only">Main sections, demo role and settings</D.Description>
          <div className="flex h-16 items-center justify-between px-4">
            <Logo surface="dark" size="sm" />
            <D.Close className="flex size-11 items-center justify-center rounded-full text-white hover:bg-white/10" aria-label="Close navigation menu">
              <X className="size-6" aria-hidden />
            </D.Close>
          </div>
          <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-3 py-2"><Tabs vertical onNavigate={() => setOpen(false)} /></nav>
          {meta && (
            <div className="space-y-3 border-t border-white/10 px-4 py-4 text-sm">
              <label className="block text-[11px] font-semibold tracking-wide text-[#B9D8DC] uppercase" htmlFor="mobile-role">Demo role</label>
              <select id="mobile-role" value={userId} onChange={(e) => { switchRole(e.target.value); setOpen(false); }}
                className="block min-h-11 w-full rounded-md border border-white/20 bg-[#0E4A5E] px-2.5 text-sm text-white">
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                  <optgroup key={r} label={ROLE_LABELS[r]}>
                    {meta.users.filter((u) => u.role === r).map((u) => <option key={u.id} value={u.id}>{shortName(u.display_name)}</option>)}
                  </optgroup>
                ))}
              </select>
              <div className="flex flex-col gap-1 pt-1">
                <Link to="/settings" onClick={() => setOpen(false)} className="iris-nav-tab">Settings and preferences</Link>
                <Link to="/help" onClick={() => setOpen(false)} className="iris-nav-tab">Help and glossary</Link>
              </div>
            </div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Floating pill navigation: brand, the five sections, and the account chip. */
export function TopNav() {
  return (
    <header className="iris-nav-wrap">
      <div className="iris-nav">
        <Link to="/" className="flex min-h-11 shrink-0 items-center rounded-md" aria-label="IRIS dashboard">
          <Logo surface="dark" />
        </Link>
        <nav aria-label="Main" className="iris-nav-tabs hidden lg:block"><Tabs /></nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden h-7 w-px bg-white/25 lg:block" aria-hidden />
          <div className="hidden lg:block"><UserMenu /></div>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
