import type { ReactNode } from "react";
import { Panel, type PanelMotif } from "@/components/ui/panel";

/** Presentation only: callers supply backend-derived values or an explicit dash. */
export function MetricCard({ label, value, detail, motif = "trends" }: {
  label: string; value: ReactNode; detail: ReactNode; motif?: PanelMotif;
}) {
  return (
    <Panel variant="metric" motif={motif} className="iris-metric" bodyClassName="p-4 lg:p-5">
      <dl>
        <dt className="iris-type-label">{label}</dt>
        <dd className="iris-type-metric mt-2">{value}</dd>
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-ink-2">{detail}</p>
    </Panel>
  );
}
