// Records a ~2-minute use-case demo of IRIS with on-screen step captions, for the final presentation:
//   docs/media/IRIS-usecase-demo.mp4       1920×1080, 30 fps, silent (the presenter talks over it)
//   docs/media/IRIS-usecase-demo-script.md  what to say at each step, with the times it appears in the video
// Resets the demo data first (so the video always shows the seeded storyline) and again at the end, so the app is
// clean for a live demo. Needs the backend on :8000, the frontend on :5180 and ffmpeg. Uses real clicks: starting a
// review, sending a question to a unit, running the planner, opening a Model A flag on real data.
// Usage: node scripts/build-usecase-demo.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.IRIS_URL ?? "http://localhost:5180";
const API = process.env.IRIS_API ?? "http://127.0.0.1:8000";
const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(ROOT, "docs/media/IRIS-usecase-demo.mp4");
const SCRIPT = resolve(ROOT, "docs/media/IRIS-usecase-demo-script.md");
const tmp = mkdtempSync(join(tmpdir(), "iris-usecase-"));

async function resetDemo() {
  const r = await fetch(`${API}/api/demo/reset`, { method: "POST", headers: { "Content-Type": "application/json", "X-IRIS-User": "U-ADMIN" }, body: JSON.stringify({ confirm: "RESET" }) });
  if (!r.ok) throw new Error(`demo reset failed: ${r.status}`);
}

// Drawn cursor with a click ring, and a caption card / full-screen title card, injected into every page.
const OVERLAY = () => {
  const add = () => {
    const c = document.createElement("div");
    c.id = "__cursor";
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 4 19 8.5 14.6 11.6 21.5 14.6 20.2 11.6 13.5 18 13.5Z" fill="#fff" stroke="#0A3A4A" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "720px", top: "405px", zIndex: "2147483647", pointerEvents: "none", transform: "translate(-4px,-2px)", filter: "drop-shadow(0 2px 3px rgb(0 0 0 / .35))" });
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      Object.assign(r.style, { position: "fixed", left: e.clientX - 18 + "px", top: e.clientY - 18 + "px", width: "36px", height: "36px", borderRadius: "50%",
        border: "3px solid #1A9EA0", zIndex: "2147483646", pointerEvents: "none", transition: "transform .45s ease-out, opacity .45s ease-out" });
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(1.8)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 500);
    }, true);
    const cap = document.createElement("div");
    cap.id = "__caption";
    Object.assign(cap.style, { position: "fixed", left: "24px", bottom: "24px", width: "520px", zIndex: "2147483645", pointerEvents: "none",
      background: "rgb(10 58 74 / .95)", color: "#fff", borderRadius: "14px", padding: "16px 20px 18px", font: "15px/1.45 Inter, system-ui, sans-serif",
      boxShadow: "0 12px 32px rgb(0 0 0 / .28)", borderLeft: "5px solid #1A9EA0", opacity: "0", transform: "translateY(10px)", transition: "opacity .35s, transform .35s" });
    document.body.appendChild(cap);
    const card = document.createElement("div");
    card.id = "__card";
    Object.assign(card.style, { position: "fixed", inset: "0", zIndex: "2147483646", display: "grid", placeItems: "center", pointerEvents: "none",
      background: "radial-gradient(ellipse at 50% 35%, #0E4A5C, #04131D 75%)", color: "#fff", font: "16px/1.5 Inter, system-ui, sans-serif",
      opacity: "0", transition: "opacity .5s" });
    document.body.appendChild(card);
    window.__caption = (step, title, line) => {
      cap.style.opacity = "0"; cap.style.transform = "translateY(10px)";
      setTimeout(() => {
        cap.innerHTML = `<div style="font-size:12px;font-weight:600;letter-spacing:.12em;color:#7FE0E2">STEP ${step} OF 6</div>
          <div style="font-size:21px;font-weight:600;margin:2px 0 4px">${title}</div><div style="color:#D6ECEF">${line}</div>`;
        cap.style.opacity = "1"; cap.style.transform = "none";
      }, step === 1 ? 0 : 300);
    };
    window.__card = (html) => { card.innerHTML = html ?? ""; card.style.opacity = html ? "1" : "0"; };
  };
  if (document.body) add(); else addEventListener("DOMContentLoaded", add);
};

await resetDemo();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 });
await ctx.addInitScript(() => window.localStorage.setItem("iris.demoUser", "U-RESU-1"));
await ctx.addInitScript(OVERLAY);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
let mouse = { x: 720, y: 405 };

const wait = (ms) => page.waitForTimeout(ms);
async function glide(x, y, ms = 650) {
  const steps = Math.max(8, Math.round(ms / 16)), from = { ...mouse };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await wait(ms / steps);
  }
  mouse = { x, y };
}
async function click(locator, ms = 650) {
  const el = locator.first();
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  await glide(b.x + Math.min(b.width / 2, 120), b.y + b.height / 2, ms);
  await page.mouse.down(); await wait(60); await page.mouse.up();
}
async function scrollTo(y, ms = 1200) {
  await page.evaluate(([to, dur]) => new Promise((done) => {
    const from = scrollY, start = performance.now();
    const step = (now) => { const t = Math.min(1, (now - start) / dur), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; scrollTo(0, from + (to - from) * e); t < 1 ? requestAnimationFrame(step) : done(); };
    requestAnimationFrame(step);
  }), [y, ms]);
}
const top = async (locator, offset = 110) => (await locator.first().evaluate((el) => el.getBoundingClientRect().top + scrollY)) - offset;
const nav = (name) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name });
const sub = (name) => page.getByRole("navigation", { name: "Section pages" }).getByRole("link", { name });

// The script the presenter reads: step, title, caption line, what to say, and when it starts in the video.
const STEPS = [];
let t0 = 0;
async function step(n, title, line, say) {
  STEPS.push({ n, title, line, say, at: Date.now() / 1000 - t0 });
  await page.evaluate(([a, b, c]) => window.__caption(a, b, c), [n, title, line]);
}
const card = (html) => page.evaluate((h) => window.__card(h), html);

// Start on a loaded dashboard so the video opens cleanly.
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
t0 = Date.now() / 1000;

// ---- Title card.
await card(`<div style="text-align:center;max-width:900px">
  <div style="font-size:14px;font-weight:600;letter-spacing:.24em;color:#7FE0E2">IRIS · USE-CASE DEMO</div>
  <div style="font-size:46px;font-weight:600;line-height:1.15;margin:14px 0 16px">A quiet week. Is it real?</div>
  <div style="font-size:20px;color:#CFE6EC">A regional surveillance analyst checks the week of Sep 28 – Oct 4, 2026,<br>decides what to fix first, and confirms reporting recovered.</div>
  <div style="font-size:14px;color:#8FB3BD;margin-top:22px">Simulated reporting region · real DOH dengue data in step 5</div></div>`);
STEPS.push({ n: 0, title: "Title", line: "A quiet week. Is it real?", say: "Introduce the user: a RESU surveillance analyst starting the week. Everything in the app is simulated except the real dengue data in step 5.", at: 0 });
await wait(5200);
await card(null);
await wait(600);

// ---- 1. Dashboard.
await step(1, "See what needs attention", "This week's numbers with 12-week trends, shared problems shaded on the chart, and every unit as a tile.",
  "IRIS opens on the week's headline: how many expected reports arrived and how many concerns are open, each compared with the week before. The chart shades the weeks of shared problems, and the tiles show every unit this week: the red ones sent nothing. Below is the work queue, overdue first.");
await wait(4500);
await scrollTo(await top(page.getByText("Reporting over 12 weeks", { exact: true }), 260), 1500);
await wait(6500);
await scrollTo(await top(page.getByText("Work queue", { exact: true }), 150), 1300);
await wait(4000);

// ---- 2. Check a flag: review it and ask the unit.
await click(page.getByRole("link", { name: "Unexpected drop in reported counts — Mapayapa RHU" }));
await page.waitForLoadState("networkidle"); await wait(400);
await step(2, "Check a flag", "Mapayapa RHU reported 1 case against about 10 expected. Its reports did arrive, so this is a count problem, not a missing report.",
  "This flag is an unexpected drop: 1 case reported against about 10 expected from recent weeks. IRIS shows the flagged week next to the weeks before, and separates what we know from what is not yet known. We start the review and ask the unit to check its case register.");
await wait(4500);
await scrollTo(await top(page.getByText("What happened", { exact: true }), 90) + 140, 1100);
await wait(3500);
await scrollTo(0, 900);
await click(page.getByRole("button", { name: "Start review" }));
await wait(1600);
await click(page.getByRole("button", { name: "More actions" }));
await wait(600);
await click(page.getByText("Ask the unit a question", { exact: true }));
await wait(700);
await page.getByRole("dialog").locator("textarea").first().click();
await page.keyboard.type("Please compare the week 38 counts with your case register.", { delay: 28 });
await wait(500);
await click(page.getByRole("button", { name: "Send question" }));
await wait(3800);

// ---- 3. Network: one cause behind two units.
await click(nav("Reporting Network"));
await page.waitForLoadState("networkidle"); await wait(600);
await step(3, "Find the shared cause", "Kalinaw RHU I and II report through the same connection. One fix may solve both.",
  "The reporting network shows how units connect to hubs and labs. Kalinaw RHU I and II share one connection, so their two problems may have one cause and one fix. The network itself is simulated; real reporting pathways are a next step.");
await wait(2200);
await click(page.getByRole("button", { name: "List", exact: true }));
await wait(600);
await click(page.getByRole("button", { name: "Kalinaw RHU I", exact: true }));
await wait(5200);
await click(page.getByRole("button", { name: "Graph", exact: true }));
await wait(4200);

// ---- 4. Planner.
await click(nav("Investigations & Actions"));
await page.waitForLoadState("networkidle"); await wait(400);
await click(sub("Plan actions"));
await page.waitForLoadState("networkidle"); await wait(700);
await step(4, "Decide what to fix first", "The 40 staff-hours as a bar: each block is one action. The plan recovers about 144 report-weeks, against 86 if the highest priority goes first.",
  "Staff time is limited. The planner takes the open concerns, the cost and expected benefit of each action, and the 40 staff-hours available, and picks the best set. Each block in the bar is one action, sized by its hours. Doing the highest-priority items first would recover less with the same hours. The benefits are planning assumptions, not proven results.");
await wait(1800);
await click(page.getByRole("button", { name: "Make a plan" }));
await wait(1800);
await scrollTo(await top(page.getByText("The plan", { exact: true }), 90), 1400);
await wait(9000);

// ---- 5. Real DOH data: a Model A flag.
await click(nav("Reports & Analysis"));
await page.waitForLoadState("networkidle"); await wait(300);
await click(sub("Real dengue data"));
await page.waitForLoadState("networkidle"); await wait(500);
await step(5, "Same models, real DOH data", "Real 2020 dengue reports: North Cotabato reported 0 cases against about 17 expected.",
  "This page runs the same models on real Department of Health dengue data from 2016 to 2021. It opens on the week of November 1, 2020, when the models ranked 46 zero reports as high priority. North Cotabato reported zero against about seventeen expected. That week was a real error: cases were typed into the deaths column. Every flag is a lead to verify.");
await wait(3000);
await scrollTo(await top(page.getByText("Zero reports each week", { exact: true }), 90), 1200);
await wait(3000);
await click(page.getByRole("button", { name: "North Cotabato", exact: true }));
await wait(9000);
await page.keyboard.press("Escape");
await wait(500);

// ---- 6. Recovery.
await click(sub("Recovery"));
await page.waitForLoadState("networkidle"); await wait(600);
await step(6, "Check that reporting recovered", "After each action, did reports come back? People verify before a concern is closed.",
  "Finally, IRIS checks whether reporting came back after each action, comparing the weeks before and after. A concern is only closed when a person confirms it with evidence.");
await wait(1600);
await scrollTo(await top(page.getByText("After each fix", { exact: true }), 140), 1400);
await wait(8000);

// ---- End card.
await page.evaluate(() => { document.getElementById("__caption").style.opacity = "0"; });
await card(`<div style="text-align:center">
  <div style="font-size:14px;font-weight:600;letter-spacing:.24em;color:#7FE0E2">IRIS</div>
  <div style="font-size:42px;font-weight:600;margin:12px 0 18px">Spot · Connect · Decide · Verify</div>
  <div style="font-size:20px;color:#CFE6EC">Every flag is a lead for a person to check, not a confirmed error.</div></div>`);
STEPS.push({ n: 7, title: "End", line: "Spot · Connect · Decide · Verify", say: "Close: IRIS turns suspicious reports into a short, ranked list of what to check, and people make the decisions.", at: Date.now() / 1000 - t0 });
await wait(4200);

const tEnd = Date.now() / 1000;
await cdp.send("Page.stopScreencast");
await browser.close();
await resetDemo();   // leave the app clean for a live demo
console.log(`recorded ${frames.length} frames over ${(tEnd - t0).toFixed(1)} s; page errors: ${errors.length}${errors.length ? " " + errors.slice(0, 3).join(" | ") : ""}`);

// Variable-rate frames -> constant 30 fps.
const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.t ?? tEnd) - f.t).toFixed(4)}`).join("\n") + `\nfile '${frames.at(-1).file}'\n`;
writeFileSync(join(tmp, "list.txt"), list);
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(tmp, "list.txt"), "-vf", "fps=30,scale=1920:1080,format=yuv420p",
  "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", "-an", OUT], { stdio: "inherit" });

// Presenter script.
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const md = [`# IRIS use-case demo: what to say`, "",
  `Video: \`docs/media/IRIS-usecase-demo.mp4\` (${mmss(tEnd - t0)}, silent). The captions on screen name each step; say the lines below while it plays.`,
  "The demo data was reset before recording, so the video shows the seeded storyline. Everything is simulated except step 5 (real DOH dengue data).", "",
  "| Time | Step | On screen | Say |", "|---|---|---|---|",
  ...STEPS.map((s) => `| ${mmss(s.at)} | ${s.n >= 1 && s.n <= 6 ? `${s.n}. ${s.title}` : s.title} | ${s.line} | ${s.say} |`), "",
  "## If someone asks", "",
  "- **Is this real data?** The region, units and workflow are simulated. Step 5 is real HDX / DOH dengue data, 2016–2021.",
  "- **How good is Model A?** On 158 known errors in 2020 it caught 32%, against 8% for the best simple method, flagging 10% of normal weeks. 2020 was looked at more than once, so treat it as a second look.",
  "- **Does the planner's benefit happen in reality?** Not yet measured. The costs and success rates are planning assumptions; measuring recovery after real actions is a next step.",
  "- **Does IRIS decide on its own?** No. It flags and ranks; a person reviews, asks the unit, and closes a concern only with evidence.", ""].join("\n");
writeFileSync(SCRIPT, md);
console.log(`Wrote ${OUT} and ${SCRIPT}`);
