import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface MenuItem { label: string; onSelect: () => void; danger?: boolean; icon?: ReactNode }

/** A small "More actions" menu. Closes on selection, outside click or Escape. */
export function ActionMenu({ items, label = "More actions", className }: { items: MenuItem[]; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={ref} className={cn("relative", className)}>
      <Button variant="secondary" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="w-full sm:w-auto">
        {label} <ChevronDown aria-hidden />
      </Button>
      {open && (
        <ul id={id} className="absolute right-0 z-30 mt-1 flex w-full min-w-56 flex-col rounded-md border border-line bg-white py-1 shadow-md sm:w-auto">
          {items.map((i) => (
            <li key={i.label}>
              <button type="button" onClick={() => { setOpen(false); i.onSelect(); }}
                className={cn("flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-aqua-50 sm:min-h-9 [&_svg]:size-4", i.danger ? "text-critical-ink" : "text-ink")}>
                {i.icon}{i.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
