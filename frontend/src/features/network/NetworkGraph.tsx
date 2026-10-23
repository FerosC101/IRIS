import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { IRIS_COLORS as colors } from "@/lib/design-tokens";
import type { NetworkEdge, NetworkNode } from "@/types/api";

export const NODE_SHAPE = { rhu: "ellipse", hospital: "round-rectangle", laboratory: "diamond", hub: "hexagon" } as const;
export const STATUS_STYLE = {
  normal: { fill: colors.surface, border: colors.data, style: "solid", width: 2 },
  delayed: { fill: colors.surface, border: colors.attention, style: "dashed", width: 2.5 },
  missing: { fill: colors.surface, border: colors.critical, style: "double", width: 5 },
  no_schedule: { fill: colors.tint, border: colors.line, style: "dotted", width: 1.5 },
} as const;
export const EDGE_STYLE = {
  reports_through: { color: colors.series2, style: "solid", arrow: "triangle" },
  specimen_referral: { color: colors.ink2, style: "dotted", arrow: "triangle" },
  shared_resource: { color: colors.data, style: "dashed", arrow: "none" },
} as const;

export function NetworkGraph({ nodes, edges, visible, selected, onSelect }: {
  nodes: NetworkNode[]; edges: NetworkEdge[]; visible: Set<string>; selected: string | null; onSelect: (id: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!ref.current) return;
    const elements: ElementDefinition[] = [
      ...nodes.map((n) => ({
        data: { id: n.id, label: n.name.replace(" Provincial Reporting Hub", " Hub").replace(" Reporting Hub", " Hub"), type: n.unit_type, status: n.status },
        position: { x: n.x, y: n.y },
      })),
      ...edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, type: e.relationship_type } })),
    ];
    const inst = cytoscape({
      container: ref.current,
      elements,
      layout: { name: "preset", fit: true, padding: 16 },
      minZoom: 0.3,
      maxZoom: 2.5,
      wheelSensitivity: 0.25,
      autoungrabify: true,
      boxSelectionEnabled: false,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)", "font-family": "Inter, sans-serif", "font-size": 12, "min-zoomed-font-size": 7, color: colors.ink,
            "text-valign": "bottom", "text-margin-y": 4, "text-wrap": "wrap", "text-max-width": "100px",
            width: 24, height: 24, "background-color": colors.surface, "border-color": colors.data, "border-width": 1.5,
          },
        },
        ...Object.entries(NODE_SHAPE).map(([t, shape]) => ({ selector: `node[type = "${t}"]`, style: { shape } })),
        { selector: 'node[type = "hub"]', style: { width: 38, height: 34, "font-weight": 600, "font-size": 12.5 } },
        { selector: 'node[type = "hospital"]', style: { width: 26, height: 20 } },
        ...Object.entries(STATUS_STYLE).map(([s, v]) => ({
          selector: `node[status = "${s}"]`,
          style: { "background-color": v.fill, "border-color": v.border, "border-style": v.style, "border-width": v.width },
        })),
        { selector: "edge", style: { width: 1.5, "curve-style": "bezier", "line-color": colors.series2, "target-arrow-color": colors.series2, "arrow-scale": 0.8 } },
        ...Object.entries(EDGE_STYLE).map(([t, v]) => ({
          selector: `edge[type = "${t}"]`,
          style: { "line-color": v.color, "target-arrow-color": v.color, "line-style": v.style, "target-arrow-shape": v.arrow },
        })),
        { selector: ".hidden", style: { display: "none" } },
        { selector: "node.selected", style: { "underlay-color": colors.data, "underlay-opacity": 0.25, "underlay-padding": 7, "underlay-shape": "ellipse" } },
        { selector: "edge.adjacent", style: { width: 2.5 } },
      ],
    });
    inst.on("tap", "node", (e) => onSelectRef.current(e.target.id()));
    inst.on("tap", (e) => { if (e.target === inst) onSelectRef.current(null); });
    const observer = new ResizeObserver(() => inst.resize());
    observer.observe(ref.current);
    cy.current = inst;
    return () => { observer.disconnect(); inst.destroy(); };
  }, [nodes, edges]);

  useEffect(() => {
    const inst = cy.current;
    if (!inst) return;
    inst.batch(() => {
      inst.nodes().forEach((n) => { n.toggleClass("hidden", !visible.has(n.id())); });
      inst.edges().forEach((e) => { e.toggleClass("hidden", !visible.has(e.data("source")) || !visible.has(e.data("target"))); });
      inst.elements().removeClass("selected adjacent");
      if (selected) {
        const n = inst.getElementById(selected);
        n.addClass("selected");
        n.connectedEdges().addClass("adjacent");
      }
    });
  }, [visible, selected, nodes]);

  const fit = () => cy.current?.fit(cy.current.elements(":visible"), 24);
  const zoom = (f: number) => { const c = cy.current; if (c) c.zoom({ level: c.zoom() * f, renderedPosition: { x: c.width() / 2, y: c.height() / 2 } }); };
  const reset = () => { onSelect(null); cy.current?.fit(undefined, 24); };

  return (
    <div className="relative">
      <div ref={ref} className="h-[24rem] w-full touch-none iris-network-canvas sm:h-[30rem] lg:h-[40rem]" role="img"
        aria-label="Graph of simulated reporting units and their defined relationships. Use the list view for an accessible alternative." />
      <div className="absolute top-2 right-2 flex flex-col gap-1 rounded-md border border-line bg-white p-1 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => zoom(1.25)} aria-label="Zoom in"><Plus aria-hidden /></Button>
        <Button variant="ghost" size="icon" onClick={() => zoom(0.8)} aria-label="Zoom out"><Minus aria-hidden /></Button>
        <Button variant="ghost" size="icon" onClick={fit} aria-label="Fit to view"><Maximize2 aria-hidden /></Button>
        <Button variant="ghost" size="icon" onClick={reset} aria-label="Reset view and selection"><RotateCcw aria-hidden /></Button>
      </div>
    </div>
  );
}
