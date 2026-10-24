import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/usePreferences";
import { fmtPct } from "@/lib/format";
import { UNIT_TYPE } from "@/lib/labels";
import type { NetworkEdge, NetworkNode, RelationshipType, UnitType } from "@/types/api";

/**
 * Reporting network as a slowly turning constellation: a 3D layout projected onto a 2D canvas.
 * Hubs are dark glass orbs with a breathing halo; units are glowing marks whose shape is the unit
 * type and whose colour is the reporting status, with a ring cue so status never rests on colour.
 */

// Colours for the dark graph canvas (canvas cannot read CSS variables).
const CANVAS = { base: "#061A21", wash: "26,158,160", grid: "152,224,216", orb: "#0B2A33", ink: "#F1F5F9", ink2: "#B8CAD0" } as const;
export const STATUS_STYLE = {
  normal: { color: "#2BC4BF", alpha: 1, cue: "none" },
  delayed: { color: "#F2B544", alpha: 1, cue: "dashed ring" },
  missing: { color: "#F07167", alpha: 1, cue: "pulsing ring" },
  no_schedule: { color: "#7B8C96", alpha: 0.45, cue: "faded" },
} as const;
export const EDGE_STYLE: Record<RelationshipType, { color: string; width: number; dash: number[]; particles: number; arrow: boolean }> = {
  reports_through: { color: "120,190,200", width: 0.8, dash: [], particles: 2, arrow: true },
  specimen_referral: { color: "150,165,180", width: 0.7, dash: [3, 4], particles: 1, arrow: true },
  shared_resource: { color: "43,196,191", width: 1.6, dash: [], particles: 0, arrow: false },
};
const RADIUS: Record<UnitType, number> = { rhu: 6, hospital: 7, laboratory: 7.5, hub: 15 };

type SimNode = {
  id: string; name: string; label: string; type: UnitType; status: NetworkNode["status"]; statusLabel: string;
  completeness: number | null; timeliness: number | null;
  x: number; y: number; z: number; vx: number; vy: number; vz: number; phase: number;
};
type SimEdge = { id: string; s: SimNode; t: SimNode; type: RelationshipType; particles: number[] };
type Proj = { x: number; y: number; z: number; r: number; k: number };
/** Camera angles and zoom, plus the centre and scale of the visible units (eased towards their targets). */
type View = { yaw: number; pitch: number; zoom: number; tYaw: number; tPitch: number; tZoom: number; c: [number, number, number]; spread: number };

const HOME = { yaw: 0.35, pitch: -0.2, zoom: 1 };
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function project(n: SimNode, w: number, h: number, v: View, fit: number): Proj {
  const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
  const x = n.x - v.c[0], y = n.y - v.c[1], z = n.z - v.c[2];
  const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
  const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
  const cam = 900;
  const k = Math.max(0.2, (cam / Math.max(150, cam + z2)) * v.zoom * fit);
  return { x: w / 2 + x1 * k, y: h / 2 + y2 * k, z: z2, r: Math.max(2, RADIUS[n.type] * Math.min(1.6, k / fit)), k };
}

/** Springs on defined relationships, mild repulsion, a pull to the centre and a little drift so it never quite rests. */
function step(nodes: SimNode[], edges: SimEdge[], drift: number) {
  for (const n of nodes) { n.vx -= n.x * 0.0006; n.vy -= n.y * 0.0006; n.vz -= n.z * 0.0006; }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d2 = dx * dx + dy * dy + dz * dz || 1, d = Math.sqrt(d2);
      if (d > 260) continue;
      const f = 2600 / d2;
      a.vx -= (dx / d) * f; a.vy -= (dy / d) * f; a.vz -= (dz / d) * f;
      b.vx += (dx / d) * f; b.vy += (dy / d) * f; b.vz += (dz / d) * f;
    }
  }
  for (const e of edges) {
    const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y, dz = e.t.z - e.s.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const rest = e.type === "shared_resource" ? 55 : e.type === "specimen_referral" ? 170 : e.s.type === "hub" || e.t.type === "hub" ? 95 : 120;
    const f = (d - rest) * (e.type === "specimen_referral" ? 0.006 : 0.02);
    e.s.vx += (dx / d) * f; e.s.vy += (dy / d) * f; e.s.vz += (dz / d) * f;
    e.t.vx -= (dx / d) * f; e.t.vy -= (dy / d) * f; e.t.vz -= (dz / d) * f;
  }
  for (const n of nodes) {
    n.vx = (n.vx + (Math.random() - 0.5) * drift) * 0.86;
    n.vy = (n.vy + (Math.random() - 0.5) * drift) * 0.86;
    n.vz = (n.vz + (Math.random() - 0.5) * drift) * 0.86;
    n.x += n.vx; n.y += n.vy; n.z += n.vz;
  }
}

function shape(ctx: CanvasRenderingContext2D, type: UnitType, x: number, y: number, r: number) {
  ctx.beginPath();
  if (type === "hospital") ctx.roundRect(x - r, y - r * 0.8, r * 2, r * 1.6, r * 0.45);
  else if (type === "laboratory") { ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r * 1.15, y); ctx.lineTo(x, y + r * 1.15); ctx.lineTo(x - r * 1.15, y); ctx.closePath(); }
  else ctx.arc(x, y, r, 0, Math.PI * 2);
}

type Scene = { nodes: SimNode[]; edges: SimEdge[]; byId: Map<string, SimNode> };

function draw(ctx: CanvasRenderingContext2D, sc: Scene, w: number, h: number, v: View, time: number, o: {
  visible: Set<string>; selected: string | null; hovered: string | null; still: boolean;
}): Map<string, Proj> {
  // Base: deep teal, a faint wash in the middle and a quiet grid.
  ctx.fillStyle = CANVAS.base; ctx.fillRect(0, 0, w, h);
  const wash = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.7);
  wash.addColorStop(0, `rgba(${CANVAS.wash},0.16)`); wash.addColorStop(1, `rgba(${CANVAS.wash},0)`);
  ctx.fillStyle = wash; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = `rgba(${CANVAS.grid},0.045)`; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = (w / 2) % 48; x < w; x += 48) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
  for (let y = (h / 2) % 48; y < h; y += 48) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
  ctx.stroke();

  const fit = Math.min(w, h) / 470 * (240 / v.spread);
  const nodes = sc.nodes.filter((n) => o.visible.has(n.id));
  const P = new Map(nodes.map((n) => [n.id, project(n, w, h, v, fit)]));
  // Focus: the selected (or hovered) unit and its direct relationships stay bright; the rest recede.
  const focus = o.selected ?? o.hovered;
  const near = new Set<string>(focus ? [focus] : []);
  if (focus) for (const e of sc.edges) { if (e.s.id === focus) near.add(e.t.id); if (e.t.id === focus) near.add(e.s.id); }
  const dim = (id: string) => (focus && !near.has(id) ? 0.22 : 1);
  const depth = (z: number) => Math.max(0.35, Math.min(1, 0.75 - z / 900));

  for (const e of sc.edges) {
    const a = P.get(e.s.id), b = P.get(e.t.id);
    if (!a || !b) continue;
    const st = EDGE_STYLE[e.type];
    const lit = focus && (e.s.id === focus || e.t.id === focus);
    const alpha = (lit ? 0.85 : 0.32) * depth((a.z + b.z) / 2) * (focus && !lit ? 0.35 : 1);
    ctx.save();
    ctx.setLineDash(st.dash);
    ctx.strokeStyle = `rgba(${st.color},${alpha})`; ctx.lineWidth = st.width * (lit ? 1.8 : 1);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
    if (st.arrow) {
      // A small arrowhead just outside the receiving unit.
      const ang = Math.atan2(b.y - a.y, b.x - a.x), ax = b.x - Math.cos(ang) * (b.r + 3), ay = b.y - Math.sin(ang) * (b.r + 3);
      ctx.fillStyle = `rgba(${st.color},${alpha})`; ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(ax - Math.cos(ang - 0.45) * 5, ay - Math.sin(ang - 0.45) * 5); ctx.lineTo(ax - Math.cos(ang + 0.45) * 5, ay - Math.sin(ang + 0.45) * 5); ctx.fill();
    }
    if (!o.still) for (const p of e.particles) {
      const px = a.x + (b.x - a.x) * p, py = a.y + (b.y - a.y) * p;
      ctx.save(); ctx.shadowColor = `rgb(${st.color})`; ctx.shadowBlur = 6;
      ctx.fillStyle = `rgba(${st.color},${Math.min(1, alpha + 0.35)})`; ctx.beginPath(); ctx.arc(px, py, lit ? 2 : 1.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  const order = [...nodes].sort((a, b) => P.get(a.id)!.z - P.get(b.id)!.z);
  for (const n of order) {
    const p = P.get(n.id)!;
    const s = STATUS_STYLE[n.status];
    const sel = n.id === o.selected, hov = n.id === o.hovered;
    const pulse = o.still ? 0.5 : (Math.sin(time * 0.0022 + n.phase) + 1) / 2;
    ctx.save();
    ctx.globalAlpha = dim(n.id) * depth(p.z);
    if (n.type === "hub") {
      ctx.strokeStyle = rgba(s.color, 0.22 + pulse * 0.18); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 7 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowColor = rgba(s.color, sel || hov ? 0.95 : 0.55); ctx.shadowBlur = sel ? 26 : hov ? 18 : 12;
      ctx.fillStyle = CANVAS.orb; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = rgba(s.color, sel ? 1 : 0.8); ctx.lineWidth = sel ? 2.2 : 1.6; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 3.5, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.globalAlpha *= s.alpha;
      ctx.shadowColor = rgba(s.color, sel || hov ? 0.95 : 0.6); ctx.shadowBlur = sel ? 18 : hov ? 13 : 7;
      ctx.fillStyle = s.color; shape(ctx, n.type, p.x, p.y, p.r); ctx.fill();
      ctx.shadowBlur = 0;
      if (sel || hov) { ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.2; shape(ctx, n.type, p.x, p.y, p.r + 1.5); ctx.stroke(); }
    }
    if (n.status === "missing") {
      const ap = o.still ? 0.6 : (Math.sin(time * 0.006 + n.phase) + 1) / 2;
      ctx.strokeStyle = rgba(s.color, 0.3 + ap * 0.45); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.25 + 4 + ap * 4, 0, Math.PI * 2); ctx.stroke();
    } else if (n.status === "delayed") {
      ctx.setLineDash([2.5, 2.5]); ctx.strokeStyle = rgba(s.color, 0.8); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.25 + 4, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // Labels in order of importance; a label that would overlap one already placed is skipped.
  const rank = (n: SimNode) => (n.id === o.selected ? 0 : n.id === o.hovered ? 1 : n.type === "hub" ? 2 : near.has(n.id) ? 3 : n.status === "missing" ? 4 : n.status === "delayed" ? 5 : 9);
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  for (const n of [...nodes].sort((a, b) => rank(a) - rank(b))) {
    const r = rank(n);
    const zoomed = v.zoom > 1.45;
    if (r === 9 && !zoomed) continue;
    if (focus && r > 3 && !near.has(n.id)) continue;
    const p = P.get(n.id)!;
    const hub = n.type === "hub";
    const size = hub ? 12.5 : r <= 1 ? 12 : 10.5;
    ctx.font = `${hub || r <= 1 ? 600 : r <= 5 ? 500 : 400} ${size}px Inter, system-ui, sans-serif`;
    const tw = ctx.measureText(n.label).width, th = size + 4;
    const box = { x: p.x - tw / 2 - 3, y: p.y + p.r + (hub ? 9 : 6), w: tw + 6, h: th };
    if (placed.some((q) => box.x < q.x + q.w && box.x + box.w > q.x && box.y < q.y + q.h && box.y + box.h > q.y)) continue;
    placed.push(box);
    ctx.save();
    ctx.globalAlpha = r <= 3 ? 1 : depth(p.z);
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 6;
    ctx.fillStyle = hub || r <= 1 ? CANVAS.ink : n.status === "missing" || n.status === "delayed" ? STATUS_STYLE[n.status].color : CANVAS.ink2;
    ctx.fillText(n.label, p.x, box.y + 2);
    ctx.restore();
  }
  return P;
}

export function NetworkGraph({ nodes, edges, visible, selected, onSelect }: {
  nodes: NetworkNode[]; edges: NetworkEdge[]; visible: Set<string>; selected: string | null; onSelect: (id: string | null) => void;
}) {
  const { prefs } = usePreferences();
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Scene>({ nodes: [], edges: [], byId: new Map() });
  const view = useRef<View>({ ...HOME, tYaw: HOME.yaw, tPitch: HOME.pitch, tZoom: HOME.zoom, c: [0, 0, 0], spread: 240 });
  const proj = useRef(new Map<string, Proj>());
  const live = useRef({ visible, selected, hovered: null as string | null, still: false, drag: null as null | { x: number; y: number; moved: number } });
  const [tip, setTip] = useState<{ n: SimNode; x: number; y: number } | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  // Motion stops when the user asks for less of it, in IRIS settings or in the operating system.
  const still = prefs.reduceMotion || (typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  Object.assign(live.current, { visible, selected, still });

  // Build the 3D layout from the backend's 2D positions, then let it settle before the first frame.
  useEffect(() => {
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const k = 420 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
    const sim = nodes.map((n, i): SimNode => ({
      id: n.id, name: n.name, type: n.unit_type, status: n.status, statusLabel: n.status_label,
      completeness: n.completeness, timeliness: n.timeliness,
      label: n.name.replace(" Provincial Reporting Hub", " Hub").replace(" Reporting Hub", " Hub"),
      x: (n.x - cx) * k, y: (n.y - cy) * k, z: ((i * 73) % 220) - 110, vx: 0, vy: 0, vz: 0, phase: i * 1.7,
    }));
    const byId = new Map(sim.map((n) => [n.id, n]));
    const links = edges.flatMap((e): SimEdge[] => {
      const s = byId.get(e.source), t = byId.get(e.target);
      return s && t ? [{ id: e.id, s, t, type: e.relationship_type, particles: Array.from({ length: EDGE_STYLE[e.relationship_type].particles }, (_, i) => i / Math.max(1, EDGE_STYLE[e.relationship_type].particles)) }] : [];
    });
    for (let i = 0; i < 500; i++) step(sim, links, 0);
    scene.current = { nodes: sim, edges: links, byId };
  }, [nodes, edges]);

  // Turn towards the selected unit and move in; step back out when it is cleared.
  useEffect(() => {
    const v = view.current;
    const n = selected ? scene.current.byId.get(selected) : undefined;
    if (n) {
      // Shortest way round to face the unit, so the view never spins a full turn.
      const x = n.x - v.c[0], y = n.y - v.c[1], z = n.z - v.c[2];
      const yaw = Math.atan2(x, z) + Math.PI;
      v.tYaw = v.yaw + Math.atan2(Math.sin(yaw - v.yaw), Math.cos(yaw - v.yaw));
      v.tPitch = Math.max(-0.9, Math.min(0.9, Math.atan2(-y, Math.hypot(x, z))));
      v.tZoom = 1.7;
    }
    else v.tZoom = 1;
  }, [selected, nodes]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let w = 0, h = 0;
    const size = () => {
      const dpr = window.devicePixelRatio || 1;
      w = c.clientWidth; h = c.clientHeight;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    let raf = 0, t = 0;
    const loop = () => {
      const L = live.current, v = view.current, sc = scene.current;
      t += 16;
      const shown = sc.nodes.filter((n) => L.visible.has(n.id));
      // With reduced motion the layout stays where the warm-up left it.
      if (!L.still) step(shown, sc.edges.filter((e) => L.visible.has(e.s.id) && L.visible.has(e.t.id)), 0.06);
      if (!L.still) for (const e of sc.edges) e.particles = e.particles.map((p) => (p + (e.type === "specimen_referral" ? 0.004 : 0.007)) % 1);
      if (!L.still && !L.drag && !L.hovered && !L.selected) v.tYaw += 0.0016;
      v.yaw += (v.tYaw - v.yaw) * 0.08; v.pitch += (v.tPitch - v.pitch) * 0.08; v.zoom += (v.tZoom - v.zoom) * 0.08;
      // Keep whatever is visible centred and filling the canvas, so a filter never leaves units off to one side.
      if (shown.length) {
        const c = [0, 1, 2].map((i) => shown.reduce((a, n) => a + [n.x, n.y, n.z][i], 0) / shown.length) as [number, number, number];
        const spread = Math.max(90, Math.min(240, Math.max(...shown.map((n) => Math.hypot(n.x - c[0], n.y - c[1], n.z - c[2])))));
        v.c = v.c.map((x, i) => x + (c[i] - x) * 0.06) as [number, number, number];
        v.spread += (spread - v.spread) * 0.06;
      }
      proj.current = draw(ctx, sc, w, h, v, t, { visible: L.visible, selected: L.selected, hovered: L.hovered, still: L.still });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const at = (e: PointerEvent | WheelEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const hit = (x: number, y: number) => {
      let best: string | null = null, bz = -Infinity;
      for (const [id, p] of proj.current) {
        const dx = x - p.x, dy = y - p.y;
        if (dx * dx + dy * dy < (p.r + 7) ** 2 && -p.z > bz) { best = id; bz = -p.z; }
      }
      return best;
    };
    const down = (e: PointerEvent) => { const p = at(e); live.current.drag = { ...p, moved: 0 }; c.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      const p = at(e), L = live.current;
      if (L.drag) {
        const dx = p.x - L.drag.x, dy = p.y - L.drag.y;
        L.drag = { x: p.x, y: p.y, moved: L.drag.moved + Math.abs(dx) + Math.abs(dy) };
        view.current.tYaw += dx * 0.006;
        view.current.tPitch = Math.max(-1.2, Math.min(1.2, view.current.tPitch + dy * 0.006));
        setTip(null);
        return;
      }
      const id = hit(p.x, p.y);
      L.hovered = id;
      c.style.cursor = id ? "pointer" : "grab";
      const n = id ? scene.current.byId.get(id) : undefined;
      setTip(n ? { n, x: p.x, y: p.y } : null);
    };
    const up = (e: PointerEvent) => {
      const L = live.current;
      if (L.drag && L.drag.moved < 5) onSelectRef.current(hit(at(e).x, at(e).y));
      L.drag = null;
    };
    const leave = () => { live.current.hovered = null; setTip(null); };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const v = view.current; v.tZoom = Math.max(0.5, Math.min(3, v.tZoom * Math.exp(-e.deltaY * 0.0012))); };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up);
    c.addEventListener("pointerleave", leave); c.addEventListener("wheel", wheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up);
      c.removeEventListener("pointerleave", leave); c.removeEventListener("wheel", wheel);
    };
  }, []);

  const zoom = (f: number) => { const v = view.current; v.tZoom = Math.max(0.5, Math.min(3, v.tZoom * f)); };
  const fit = () => { const v = view.current; v.tZoom = 1; v.tPitch = HOME.pitch; };
  const reset = () => { onSelect(null); Object.assign(view.current, { tYaw: HOME.yaw, tPitch: HOME.pitch, tZoom: HOME.zoom }); };

  return (
    <div className="relative overflow-hidden">
      <canvas ref={canvas} className="block h-[24rem] w-full touch-none sm:h-[30rem] lg:h-[40rem]" role="img"
        aria-label="Reporting network shown as a slowly turning 3D graph of simulated units and their defined relationships. Use the list view for an accessible alternative." />
      {tip && (
        <div className="pointer-events-none absolute z-10 max-w-60 rounded-md border border-white/10 bg-[#0B2A33]/95 px-3 py-2 text-white shadow-lg"
          style={{ left: tip.x + 260 > (canvas.current?.clientWidth ?? 0) ? tip.x - 254 : tip.x + 14, top: tip.y + 14 }}>
          <p className="text-[13px] leading-tight font-semibold">{tip.n.name}</p>
          <p className="mt-0.5 text-[11.5px] text-[#B8CAD0]">{UNIT_TYPE[tip.n.type]} · <span style={{ color: STATUS_STYLE[tip.n.status].color }}>{tip.n.statusLabel}</span></p>
          {(tip.n.completeness !== null || tip.n.timeliness !== null) && (
            <p className="mt-1 text-[11.5px] text-[#B8CAD0] tabular">Completeness {fmtPct(tip.n.completeness)} · Timeliness {fmtPct(tip.n.timeliness)}</p>
          )}
          <p className="mt-1 text-[11px] text-[#7FA3AC]">Click for details</p>
        </div>
      )}
      <div className="absolute top-2 right-2 flex flex-col gap-1 rounded-md border border-white/10 bg-[#0B2A33]/90 p-1 text-white">
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => zoom(1.25)} aria-label="Zoom in"><Plus aria-hidden /></Button>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => zoom(0.8)} aria-label="Zoom out"><Minus aria-hidden /></Button>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={fit} aria-label="Fit to view"><Maximize2 aria-hidden /></Button>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={reset} aria-label="Reset view and selection"><RotateCcw aria-hidden /></Button>
      </div>
      <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-[#7FA3AC]">Drag to turn · scroll to zoom · click a unit for details</p>
    </div>
  );
}
