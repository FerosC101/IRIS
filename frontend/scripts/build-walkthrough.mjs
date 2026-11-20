// Records a silent ~30 s walkthrough of the running app and ends on the animated logo:
//   docs/media/IRIS-walkthrough.mp4 (1920×1080, 30 fps, no audio)
// Frames come from Chrome's screencast (sharp text, unlike Playwright's built-in recorder); a drawn cursor shows
// where each click lands. Needs the backend on :8000, the frontend on :5180 and ffmpeg.
// Usage: node scripts/build-walkthrough.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.IRIS_URL ?? "http://localhost:5180";
const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(ROOT, "docs/media/IRIS-walkthrough.mp4");
const LOGO = resolve(ROOT, "docs/brand/animation/iris-logo-dark.mp4");
const TOTAL = 30, LOGO_LEN = 3.3, FADE = 0.5;
const WALK = TOTAL - LOGO_LEN + FADE;   // walkthrough length before the logo fades in
const tmp = mkdtempSync(join(tmpdir(), "iris-walk-"));

// A visible cursor (headless Chrome draws none), with a ring on each click.
const CURSOR = () => {
  const add = () => {
    const c = document.createElement("div");
    c.id = "__cursor";
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 4 19 8.5 14.6 11.6 21.5 14.6 20.2 11.6 13.5 18 13.5Z" fill="#fff" stroke="#0A3A4A" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", transform: "translate(-4px,-2px)", filter: "drop-shadow(0 2px 3px rgb(0 0 0 / .35))" });
    document.body.appendChild(c);
    const pos = window.__cursorPos ?? { x: 720, y: 405 };
    c.style.left = pos.x + "px"; c.style.top = pos.y + "px";
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; window.__cursorPos = { x: e.clientX, y: e.clientY }; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      Object.assign(r.style, { position: "fixed", left: e.clientX - 18 + "px", top: e.clientY - 18 + "px", width: "36px", height: "36px", borderRadius: "50%",
        border: "3px solid #1A9EA0", zIndex: "2147483646", pointerEvents: "none", transition: "transform .45s ease-out, opacity .45s ease-out" });
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(1.8)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 500);
    }, true);
  };
  if (document.body) add(); else addEventListener("DOMContentLoaded", add);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 });
await ctx.addInitScript(() => window.localStorage.setItem("iris.demoUser", "U-RESU-1"));
await ctx.addInitScript(CURSOR);
const page = await ctx.newPage();
let mouse = { x: 720, y: 405 };

const wait = (ms) => page.waitForTimeout(ms);
async function glide(x, y, ms = 600) {
  const steps = Math.max(8, Math.round(ms / 16));
  const from = { ...mouse };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;   // ease in-out
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await wait(ms / steps);
  }
  mouse = { x, y };
}
async function click(locator, ms = 600) {
  const el = locator.first();
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  await glide(b.x + Math.min(b.width / 2, 120), b.y + b.height / 2, ms);
  await page.mouse.down(); await wait(60); await page.mouse.up();
}
async function scrollTo(y, ms = 1200) {
  await page.evaluate(([to, dur]) => new Promise((done) => {
    const from = scrollY, start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      scrollTo(0, from + (to - from) * e);
      t < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
  }), [y, ms]);
}
const top = async (locator) => (await locator.first().evaluate((el) => el.getBoundingClientRect().top + scrollY)) - 110;

// Load the first screen before recording so the video starts on a finished page.
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await wait(800);
await page.mouse.move(mouse.x, mouse.y);

const frames = [];
const cdp = await ctx.newCDPSession(page);
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = join(tmp, `${String(frames.length).padStart(5, "0")}.jpg`);
  writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
const t0 = Date.now() / 1000;

// 1. Dashboard: the summary, then the work queue filtered to new concerns.
await wait(1000);
await scrollTo(await top(page.getByText("Work queue", { exact: true })), 1500);
await click(page.getByRole("button", { name: /^New/ }));
await wait(1000);

// 2. A concern: what happened, compared with the weeks before.
await click(page.locator('table:has(> caption:text-is("Work queue")) tbody tr a').first());
await page.waitForLoadState("networkidle"); await wait(900);
await scrollTo(await top(page.getByText("What happened", { exact: true })) + 60, 1100);
await wait(1300);

// 3. Reporting network: the moving graph, then one unit's details.
await click(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Reporting Network" }));
await page.waitForLoadState("networkidle"); await wait(1500);
await click(page.getByRole("button", { name: "List", exact: true }));
await wait(500);
await click(page.getByRole("button", { name: "Hiraya RHU", exact: true }));
await wait(700);
await click(page.getByRole("button", { name: "Graph", exact: true }));
await wait(1600);

// 4. Real dengue data: a zero report ranked for checking.
await click(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Reports & Analysis" }));
await page.waitForLoadState("networkidle"); await wait(400);
await click(page.getByRole("navigation", { name: "Section pages" }).getByRole("link", { name: "Real dengue data" }));
await page.waitForLoadState("networkidle"); await wait(900);
await click(page.locator("table tbody tr button").first());
await wait(2000);
await page.keyboard.press("Escape"); await wait(300);

// 5. Recovery: did reporting come back after each action?
await click(page.getByRole("navigation", { name: "Section pages" }).getByRole("link", { name: "Recovery" }));
await page.waitForLoadState("networkidle"); await wait(700);
await scrollTo(await top(page.getByText("Did reporting come back after each action?", { exact: true })), 1500);
await wait(1500);

const tEnd = Date.now() / 1000;
await cdp.send("Page.stopScreencast");
await browser.close();
console.log(`recorded ${frames.length} frames over ${(tEnd - t0).toFixed(1)} s`);

// Variable-rate frames -> constant 30 fps, trimmed to the walkthrough length, then a cross-fade into the logo.
const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.t ?? tEnd) - f.t).toFixed(4)}`).join("\n")
  + `\nfile '${frames.at(-1).file}'\n`;
writeFileSync(join(tmp, "list.txt"), list);
const walk = join(tmp, "walk.mp4");
const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a], { stdio: "inherit" });
ff("-f", "concat", "-safe", "0", "-i", join(tmp, "list.txt"), "-vf", `fps=30,scale=1920:1080,format=yuv420p,tpad=stop_mode=clone:stop_duration=2`,
   "-t", String(WALK), "-c:v", "libx264", "-crf", "18", "-preset", "slow", walk);
ff("-i", walk, "-i", LOGO, "-filter_complex",
   `[0:v]settb=AVTB,setsar=1[a];[1:v]fps=30,scale=1920:1080,setsar=1,settb=AVTB[b];[a][b]xfade=transition=fade:duration=${FADE}:offset=${WALK - FADE},format=yuv420p[v]`,
   "-map", "[v]", "-an", "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", "-t", String(TOTAL), OUT);
console.log(`Wrote ${OUT}`);
