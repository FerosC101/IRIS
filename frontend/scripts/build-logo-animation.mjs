// Builds the animated IRIS logo mark (no wordmark) into docs/brand/animation/:
//   iris-logo-animated.html     self-contained page (?theme=dark|light|transparent|transparent-teal, ?loop=1 to replay)
//   iris-logo-dark.mp4          1920×1080, 60 fps, on the dark brand background
//   iris-logo-transparent-{bright,teal}.{mov,webm}   1920×1080, 60 fps, no background: bright teal for dark
//                               backgrounds, dark teal for light ones. .mov is ProRes 4444 (video editors,
//                               Keynote, PowerPoint on Mac); .webm is VP9 with alpha (web pages)
//   iris-logo-light.gif, iris-logo-dark.gif   small loops for the README
// The mark's three shapes (top stroke, ring, bottom stroke) are cut from the original logo file, so the
// shapes are exactly the logo's. No servers needed; needs ffmpeg. Usage: node scripts/build-logo-animation.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(ROOT, "docs/brand/animation");
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "iris-logo-"));

// 1. Cut the mark into its three shapes (connected regions of the alpha channel), cropped like docs/brand/iris-mark-*.png.
const CROP = { left: 9, top: 122, width: 514, height: 282 };
const { data, info } = await sharp(resolve(import.meta.dirname, "../src/assets/brand/logo-dark-teal.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, N = W * H;
const label = new Int32Array(N);
const regions = [];
for (let i = 0; i < N; i++) {
  if (label[i] || data[i * 4 + 3] <= 8) continue;
  const id = regions.length + 1; const stack = [i]; label[i] = id; let size = 0, x0 = W, x1 = 0, y0 = H;
  while (stack.length) {
    const p = stack.pop(); size++; const x = p % W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, (p / W) | 0);
    for (const q of [p - 1, p + 1, p - W, p + W]) {
      if (q >= 0 && q < N && !label[q] && data[q * 4 + 3] > 8 && Math.abs((q % W) - x) <= 1) { label[q] = id; stack.push(q); }
    }
  }
  regions.push({ id, size, x0, x1, y0 });
}
const shapes = regions.filter((r) => r.size > 300);
if (shapes.length !== 3) throw new Error(`expected 3 shapes in the mark, found ${shapes.length}`);
// Top to bottom: the upper stroke, the ring, the lower stroke.
const [top, ring, bottom] = [...shapes].sort((a, b) => a.y0 - b.y0);
async function maskURI(id) {
  const out = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) if (label[i] === id) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 255; out[i * 4 + 3] = data[i * 4 + 3]; }
  const png = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).extract(CROP).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
const MASK = { top: await maskURI(top.id), ring: await maskURI(ring.id), bottom: await maskURI(bottom.id) };

// Where each stroke starts drawing (its leftmost / rightmost pixel in the crop), so the reveal begins at the shape.
const topStart = ((CROP.width - (top.x0 - CROP.left)) / CROP.width) * 100;
const bottomStart = ((bottom.x1 - CROP.left + 1) / CROP.width) * 100;

// 2. The animated page. Timeline (s): top stroke draws right 0.1–1.7 · bottom draws left 0.25–1.85 ·
// the ring is drawn from its top down both sides at once, meeting at the bottom 1.6–2.7 (a two-sided conic
// sweep over the ring's own shape) · hold to 3.3.
// No scaling, overshoot, pulse or shake.
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>IRIS logo animation</title>
<style>
  :root { --mark: #4BF7FF; --bg: radial-gradient(ellipse at 50% 35%, #0E4A5C, #04131D 72%); --h: 150px; }
  html[data-theme="light"] { --mark: #1A6985; --bg: #F7F9F9; }
  html[data-theme="transparent"] { --bg: transparent; }
  html[data-theme="transparent-teal"] { --mark: #1A6985; --bg: transparent; }
  html, body { margin: 0; height: 100%; }
  body { display: grid; place-items: center; background: var(--bg); overflow: hidden; }
  .mark { position: relative; height: var(--h); aspect-ratio: ${CROP.width} / ${CROP.height}; }
  .part { position: absolute; inset: 0; background: var(--mark); -webkit-mask: var(--m) center / 100% 100% no-repeat; mask: var(--m) center / 100% 100% no-repeat; }
  @property --half { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
  .ring {
    --m: url(${MASK.ring});
    --cone: conic-gradient(from 0deg at 48.6% 50.4%, #000 0 var(--half), transparent var(--half) calc(360deg - var(--half)), #000 calc(360deg - var(--half)));
    -webkit-mask: var(--m) center / 100% 100% no-repeat, var(--cone); -webkit-mask-composite: source-in;
    mask: var(--m) center / 100% 100% no-repeat, var(--cone); mask-composite: intersect;
    animation: drawRing 1.1s cubic-bezier(.45,0,.25,1) 1.6s both;
  }
  .top { --m: url(${MASK.top}); animation: drawRight 1.6s cubic-bezier(.45,0,.25,1) .1s both; }
  .bottom { --m: url(${MASK.bottom}); animation: drawLeft 1.6s cubic-bezier(.45,0,.25,1) .25s both; }
  @keyframes drawRing { from { --half: 0deg } to { --half: 180deg } }
  @keyframes drawRight { from { clip-path: inset(0 ${topStart.toFixed(1)}% 0 0) } to { clip-path: inset(0 0 0 0) } }
  @keyframes drawLeft { from { clip-path: inset(0 0 0 ${bottomStart.toFixed(1)}%) } to { clip-path: inset(0 0 0 0) } }
  @media (prefers-reduced-motion: reduce) { .part { animation: none !important } .ring { --half: 180deg } }
</style></head>
<body>
  <div class="mark" role="img" aria-label="IRIS"><div class="part bottom"></div><div class="part top"></div><div class="part ring"></div></div>
  <script>
    const q = new URLSearchParams(location.search);
    document.documentElement.dataset.theme = q.get("theme") || "dark";
    if (q.get("size")) document.documentElement.style.setProperty("--h", q.get("size") + "px");
    if (q.has("loop")) setInterval(() => document.getAnimations().forEach((a) => { a.cancel(); a.play(); }), 3600);
  </script>
</body></html>`;
const page = resolve(OUT, "iris-logo-animated.html");
writeFileSync(page, html);
console.log("Wrote docs/brand/animation/iris-logo-animated.html");

// 3. Render frames by stepping every animation to an exact time, then encode.
const DURATION = 3.3;
const browser = await chromium.launch();
async function frames(name, { theme, width, height, size, fps, transparent = false }) {
  const dir = join(tmp, name); mkdirSync(dir);
  const p = await browser.newPage({ viewport: { width, height } });
  await p.goto(`${pathToFileURL(page).href}?theme=${theme}&size=${size}`);
  const n = Math.round(DURATION * fps);
  for (let f = 0; f < n; f++) {
    await p.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), (f / fps) * 1000);
    await p.screenshot({ path: join(dir, `${String(f).padStart(4, "0")}.png`), omitBackground: transparent });
  }
  await p.close();
  return join(dir, "%04d.png");
}
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });

const dark = await frames("dark", { theme: "dark", width: 1920, height: 1080, size: 420, fps: 60 });
ff("-framerate", "60", "-i", dark, "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", resolve(OUT, "iris-logo-dark.mp4"));
for (const [colour, theme] of [["bright", "transparent"], ["teal", "transparent-teal"]]) {
  const alpha = await frames(`alpha-${colour}`, { theme, width: 1920, height: 1080, size: 420, fps: 60, transparent: true });
  ff("-framerate", "60", "-i", alpha, "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-alpha_bits", "16", "-vendor", "apl0", resolve(OUT, `iris-logo-transparent-${colour}.mov`));
  ff("-framerate", "60", "-i", alpha, "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "28", "-auto-alt-ref", "0", resolve(OUT, `iris-logo-transparent-${colour}.webm`));
}
for (const theme of ["light", "dark"]) {
  const f = await frames(`gif-${theme}`, { theme, width: 640, height: 400, size: 210, fps: 30 });
  ff("-framerate", "30", "-i", f, "-vf", "split[a][b];[a]palettegen=max_colors=96:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a", "-loop", "0", resolve(OUT, `iris-logo-${theme}.gif`));
}
await browser.close();
console.log("Wrote iris-logo-dark.mp4, iris-logo-transparent-{bright,teal}.{mov,webm}, iris-logo-light.gif, iris-logo-dark.gif");
