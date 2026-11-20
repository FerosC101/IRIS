// Measures the IRIS mark from the logo PNG so it can be rebuilt as vector geometry (used by scripts/blender/iris_eye.py):
// each stroke's centre line, its width and its arrowhead, and the ring's outer and inner ellipse.
// Writes JSON (logo pixels, y down) to the path given. Usage: node scripts/logo-geometry.mjs <out.json>
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const OUT = process.argv[2];
const { data, info } = await sharp(resolve(import.meta.dirname, "../src/assets/brand/logo-dark-teal.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, N = W * H;
const on = (i) => data[i * 4 + 3] > 128;

// Connected shapes.
const label = new Int32Array(N), regions = [];
for (let i = 0; i < N; i++) {
  if (label[i] || !on(i)) continue;
  const id = regions.length + 1, stack = [i], px = []; label[i] = id;
  while (stack.length) {
    const p = stack.pop(); px.push(p); const x = p % W;
    for (const q of [p - 1, p + 1, p - W, p + W]) if (q >= 0 && q < N && !label[q] && on(q) && Math.abs((q % W) - x) <= 1) { label[q] = id; stack.push(q); }
  }
  regions.push({ id, px });
}
const shapes = regions.filter((r) => r.px.length > 300).map((r) => {
  const xs = r.px.map((p) => p % W), ys = r.px.map((p) => (p / W) | 0);
  return { ...r, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
});
if (shapes.length !== 3) throw new Error(`expected 3 shapes, found ${shapes.length}`);
const [top, ring, bottom] = shapes.sort((a, b) => a.y0 - b.y0);

// Ring: outer ellipse from its bounds, inner ellipse from the hole along the centre row and column.
const cx = (ring.x0 + ring.x1 + 1) / 2, cy = (ring.y0 + ring.y1 + 1) / 2;
const inRing = (x, y) => label[y * W + x] === ring.id;
const scan = (dx, dy) => { let x = Math.round(cx), y = Math.round(cy), n = 0; while (!inRing(x, y) && n < 200) { x += dx; y += dy; n++; } return n; };
const ringGeo = { cx, cy, rx: (ring.x1 - ring.x0 + 1) / 2, ry: (ring.y1 - ring.y0 + 1) / 2,
  irx: (scan(-1, 0) + scan(1, 0)) / 2, iry: (scan(0, -1) + scan(0, 1)) / 2 };

// Strokes: per column, the middle of the stroke and its height; the arrowhead is where the height jumps.
function stroke(s, arrowAtRight) {
  const cols = [];
  for (let x = s.x0; x <= s.x1; x++) {
    let a = Infinity, b = -Infinity, n = 0;
    for (let y = s.y0; y <= s.y1; y++) if (label[y * W + x] === s.id) { a = Math.min(a, y); b = Math.max(b, y); n++; }
    if (n) cols.push({ x, mid: (a + b) / 2, n });
  }
  const sorted = cols.map((c) => c.n).sort((p, q) => p - q), width = sorted[Math.floor(sorted.length * 0.3)];
  const order = arrowAtRight ? [...cols].reverse() : cols;   // walk in from the arrow end
  let k = 0; while (k < order.length && order[k].n <= 1.5 * width) k++;   // the narrow tip
  while (k < order.length && order[k].n > 1.5 * width) k++;                 // the wide head, back to its base
  const arrowCols = order.slice(0, k), body = order.slice(k).reverse();   // body runs from its plain end to the arrow
  const base = arrowCols.at(-1), tip = arrowCols[0];
  const half = Math.max(...arrowCols.map((c) => c.n)) / 2;
  const arrowY = arrowCols.reduce((a, c) => a + c.mid * c.n, 0) / arrowCols.reduce((a, c) => a + c.n, 0);
  // Smooth the centre line, trim the slanted plain end, sample every 5 px, and run it into the arrow base.
  const trim = Math.round(width * 0.45), pts = [];
  const sm = body.map((c, i) => { const w = body.slice(Math.max(0, i - 7), i + 8); return { x: c.x, y: w.reduce((a, d) => a + d.mid, 0) / w.length }; });
  for (let i = trim; i < sm.length; i += 5) pts.push([sm[i].x, sm[i].y]);
  pts.push([base.x + (arrowAtRight ? 4 : -4), arrowY]);
  return { width, points: pts, arrow: { base: [base.x, arrowY], tip: [tip.x + (arrowAtRight ? 1 : -1), arrowY], half } };
}
const geo = { size: [W, H], color: "#4BF7FF", ring: ringGeo, top: stroke(top, true), bottom: stroke(bottom, false) };
writeFileSync(OUT, JSON.stringify(geo, null, 1));
console.log(`ring centre ${cx},${cy} outer ${ringGeo.rx}×${ringGeo.ry} inner ${ringGeo.irx}×${ringGeo.iry}; ` +
  `stroke widths ${geo.top.width}/${geo.bottom.width}; top ${geo.top.points.length} pts, arrow half ${geo.top.arrow.half}; bottom ${geo.bottom.points.length} pts, arrow half ${geo.bottom.arrow.half}`);
