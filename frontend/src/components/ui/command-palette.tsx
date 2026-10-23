import * as D from "@radix-ui/react-dialog";
import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface CommandItem { id: string; label: string; group?: string; description?: string; keywords?: string }

/**
 * Searchable list for jumping to an item ("Find a unit"). Type to filter;
 * Arrow keys move, Enter chooses, Escape closes. Follows the combobox +
 * listbox pattern. `hotkey` (default "k") also opens it with Ctrl/⌘+K.
 */
export function CommandPalette({ open, onOpenChange, items, onSelect, title = "Find", placeholder = "Search", hotkey = "k", emptyText = "Nothing matches." }: {
  open: boolean; onOpenChange: (o: boolean) => void; items: CommandItem[]; onSelect: (item: CommandItem) => void;
  title?: string; placeholder?: string; hotkey?: string | null; emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === hotkey) { e.preventDefault(); onOpenChange(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey, onOpenChange]);
  useEffect(() => { if (!open) { setQuery(""); setActive(0); } }, [open]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => `${i.label} ${i.id} ${i.description ?? ""} ${i.keywords ?? ""}`.toLowerCase().includes(q)) : items;
  }, [items, query]);
  const choose = (i: CommandItem | undefined) => { if (i) { onSelect(i); onOpenChange(false); } };
  const optionId = (i: number) => `${listId}-opt-${i}`;
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-teal-900/40" />
        <D.Content className="fixed top-[12vh] left-1/2 z-50 w-[min(34rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-line-strong bg-white shadow-md">
          <D.Title className="sr-only">{title}</D.Title>
          <D.Description className="sr-only">Type to filter, use the arrow keys to move and Enter to choose.</D.Description>
          <div className="flex items-center gap-2 border-b border-line px-4">
            <Search className="size-4 shrink-0 text-ink-2" aria-hidden />
            <input role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-label={title}
              aria-activedescendant={results[active] ? optionId(active) : undefined}
              value={query} placeholder={placeholder} autoFocus
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
              }}
              className="min-h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-2" />
            {hotkey && <kbd className="hidden rounded border border-line px-1.5 text-[11px] text-ink-2 sm:inline">Ctrl K</kbd>}
          </div>
          <ul id={listId} role="listbox" aria-label={`${title} results`} className="max-h-[50vh] overflow-y-auto p-1.5">
            {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-2" role="presentation">{emptyText}</li>}
            {results.map((it, i) => (
              <li key={it.id} id={optionId(i)} role="option" aria-selected={i === active}
                onMouseMove={() => setActive(i)} onClick={() => choose(it)}
                className={cn("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm", i === active && "bg-tint")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{it.label}</span>
                  <span className="block truncate text-xs text-ink-2">{[it.id, it.group, it.description].filter(Boolean).join(" · ")}</span>
                </span>
                {i === active && <CornerDownLeft className="size-4 shrink-0 text-ink-2" aria-hidden />}
              </li>
            ))}
          </ul>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
