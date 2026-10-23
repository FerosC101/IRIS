// Compare each screen's hero at 1440 px with the mockup in docs/design/.
// Writes <out>/<screen>-compare.png (mockup on top, IRIS below) and prints the
// luminance difference (IRIS − mockup) on a grid of sample points.
// Usage: node scripts/compare-heroes.mjs [baseUrl] [outDir]   (needs the app running)
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const BASE = process.argv[2] ?? "http://localhost:5180";
const OUT = resolve(process.argv[3] ?? "qa-screenshots/heroes");
const DESIGN = resolve("../docs/design");
const W = 1344, H = 330;
// The 1488 px mockups include a 24 px frame, so their hero starts at (72, 148).
const SCREENS = [
  { name: "dashboard", route: "/", mock: "dashboard.png", box: [48, 132] },
  { name: "reports", route: "/reports", mock: "reports-analysis.png", box: [72, 148] },
  { name: "network", route: "/network", mock: "reporting-network.png", box: [72, 148] },
  { name: "investigations", route: "/investigations", mock: "investigations-actions.png", box: [72, 148] },
  { name: "data", route: "/data", mock: "data-models.png", box: [48, 132] },
];
const XS = [0.01, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.99];
const YS = [0.06, 0.5, 0.94];
const lum = ([r, g, b]) => Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  for (const s of SCREENS) {
    await page.goto(`${BASE}${s.route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const hero = page.locator(".iris-hero").first();
    const bb = await hero.boundingBox();
    const shot = sharp(await hero.screenshot()).resize(W, H, { fit: "fill" });
    const mock = sharp(join(DESIGN, s.mock)).extract({ left: s.box[0], top: s.box[1], width: W, height: H });
    const [a, b] = await Promise.all([shot.clone().raw().toBuffer({ resolveWithObject: true }), mock.clone().raw().toBuffer({ resolveWithObject: true })]);
    const patch = (img, fx, fy) => {
      const acc = [0, 0, 0];
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = Math.min(W - 1, Math.max(0, Math.round(fx * W + dx))), y = Math.min(H - 1, Math.max(0, Math.round(fy * H + dy)));
        const i = (y * W + x) * img.info.channels;
        acc[0] += img.data[i]; acc[1] += img.data[i + 1]; acc[2] += img.data[i + 2];
      }
      return acc.map((v) => v / 81);
    };
    let total = 0;
    const rows = YS.map((fy) => XS.map((fx) => { const d = lum(patch(a, fx, fy)) - lum(patch(b, fx, fy)); total += Math.abs(d); return String(d).padStart(4); }).join(" "));
    console.log(`${s.name}: hero ${Math.round(bb.width)}x${Math.round(bb.height)} at (${Math.round(bb.x)},${Math.round(bb.y)}); mean |Δlum| ${(total / (XS.length * YS.length)).toFixed(1)}`);
    rows.forEach((r, i) => console.log(`  y=${YS[i].toFixed(2)} ${r}`));
    await sharp({ create: { width: W, height: H * 2 + 8, channels: 3, background: "#FF00FF" } })
      .composite([{ input: await mock.png().toBuffer(), top: 0, left: 0 }, { input: await shot.png().toBuffer(), top: H + 8, left: 0 }])
      .png().toFile(join(OUT, `${s.name}-compare.png`));
  }
  console.log(`Comparison images in ${OUT}`);
} finally {
  await browser.close();
}
