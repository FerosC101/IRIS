import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PanelVariant = "card" | "dark" | "secondary" | "metric" | "hero";
export type PanelMotif = "records" | "trends" | "verify" | "network";

const SURFACES: Record<PanelVariant, string> = {
  card: "",
  dark: "iris-surface-dark",
  secondary: "iris-surface-secondary",
  metric: "iris-surface-metric iris-surface-light",
  hero: "iris-surface-hero iris-surface-light",
};

/** Shared card: white with a 1px border by default; "secondary" is the pale tinted card, "dark" the dark teal card. */
export function Panel({ title, description, actions, children, className, bodyClassName, id, as: As = "section", variant = "card", motif }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string; as?: "section" | "div";
  variant?: PanelVariant;
  motif?: PanelMotif;
}) {
  return (
    <As id={id} data-motif={motif} className={cn("iris-surface", SURFACES[variant], className)} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 id={id ? `${id}-title` : undefined} className="text-[15px] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-ink-2">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </As>
  );
}

export function KeyValue({ items, className, columns = 2 }: { items: { label: string; value: ReactNode }[]; className?: string; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3", columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-ink-2">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
