// Builds 16:9 (3840×2160) collages of desktop and phone screenshots of the running app:
// docs/IRIS-Snapshots.png and docs/IRIS-Snapshots-2.png, one per row of screens below.
// Needs the backend on :8000 and the frontend on :5180. Usage: node scripts/build-snapshots.mjs
import { chromium } from "playwright";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BASE = process.env.IRIS_URL ?? "http://localhost:5180";
const out = (i) => resolve(import.meta.dirname, `../../docs/IRIS-Snapshots${i ? `-${i + 1}` : ""}.png`);
const tmp = mkdtempSync(join(tmpdir(), "iris-snap-"));

// Each row is one image: two desktop screens stacked on the left, three phone screens beside them.
const ROWS = [
  {
    desktop: [{ path: "/" }, { path: "/investigations/C-0014" }],
    phone: [{ path: "/", user: "U-RHU-HIRAYA" }, { path: "/investigations/C-0012" }, { path: "/network" }],
  },
  {
    desktop: [{ path: "/network?unit=HUB-REG" }, { path: "/reports/recovery" }],
    phone: [{ path: "/reports/recovery", anchor: "Reports arriving each week" }, { path: "/reports/dengue" }, { path: "/investigations" }],
  },
];

// Tile sizes in the collage (CSS px). Phones are as tall as the two stacked desktops.
// The frame is 2880×1620 CSS px (16:9), rendered at 4/3 scale to 3840×2160.
const FRAME_W = 2880, FRAME_H = 1620;
const DESK_W = 1200, DESK_H = 750, GAP = 24, PAD = 48;
const ROW_H = DESK_H * 2 + GAP;
const PHONE_VIEW_W = 390;
const PHONE_W = Math.round((ROW_H * PHONE_VIEW_W) / 1240);

const browser = await chromium.launch();

async function shot({ path, user = "U-RESU-1", anchor }, kind, file) {
  const phone = kind === "phone";
  const ctx = await browser.newContext({
    viewport: phone ? { width: PHONE_VIEW_W, height: 1240 } : { width: 1440, height: 900 },
    deviceScaleFactor: 2, reducedMotion: "reduce",
  });
  await ctx.addInitScript((u) => window.localStorage.setItem("iris.demoUser", u), user);
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // Start the shot at a section heading, just below the pinned navigation bar.
  if (anchor) {
    const y = await page.getByText(anchor, { exact: true }).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((top) => window.scrollTo(0, top - 110), y);
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: file });
  await ctx.close();
  return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
}

const style = `
  body { margin: 0; background: #E9F0F1; }
  .frame { width: ${FRAME_W}px; height: ${FRAME_H}px; display: flex; align-items: center; justify-content: center; gap: ${GAP}px; box-sizing: border-box; padding: ${PAD}px; }
  .stack { display: flex; flex-direction: column; gap: ${GAP}px; }
  .tile { display: block; border: 1px solid #C9D6DA; border-radius: 14px; background: #fff; box-shadow: 0 6px 24px rgb(10 58 74 / 0.10); object-fit: cover; object-position: top; }
  .desk { width: ${DESK_W}px; height: ${DESK_H}px; }
  .phone { width: ${PHONE_W}px; height: ${ROW_H}px; border-radius: 22px; }`;

let n = 0;
for (const [i, row] of ROWS.entries()) {
  const desk = [];
  for (const d of row.desktop) desk.push(await shot(d, "desktop", join(tmp, `${n++}.png`)));
  const phones = [];
  for (const p of row.phone) phones.push(await shot(p, "phone", join(tmp, `${n++}.png`)));
  const page = await browser.newPage({ viewport: { width: FRAME_W, height: FRAME_H }, deviceScaleFactor: 4 / 3 });
  await page.setContent(`<!doctype html><html><head><style>${style}</style></head><body><div class="frame">
    <div class="stack">${desk.map((s) => `<img class="tile desk" src="${s}">`).join("")}</div>
    ${phones.map((s) => `<img class="tile phone" src="${s}">`).join("")}
  </div></body></html>`);
  await page.waitForLoadState("load");
  await page.locator(".frame").screenshot({ path: out(i) });
  await page.close();
  console.log(`Wrote ${out(i)}`);
}
await browser.close();
