// Builds a 16:9 pitch-deck slide: current progress, limitations and next steps, matching the other IRIS slides:
//   docs/slides/IRIS-Progress.png (3840×2160)
// Figures: Model A from models/pipeline/outputs/model_a_v2/eval_report.md (run 3); zero-report ranking from
// outputs/zero_priority/report.md; network and planner from outputs/results/RESULTS.md. No servers needed.
// Usage: node scripts/build-progress-slide.mjs
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(ROOT, "docs/slides/IRIS-Progress.png");
mkdirSync(resolve(ROOT, "docs/slides"), { recursive: true });

const I = (d, w = 30) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  real: I(`<circle cx="12" cy="12" r="9.5"/><path d="m7.5 12.3 3 3 6-6.3"/>`),
  sim: I(`<path d="M9.5 3h5M10 3v6.5L4.8 18.6A1.7 1.7 0 0 0 6.3 21h11.4a1.7 1.7 0 0 0 1.5-2.4L14 9.5V3"/><path d="M7.5 15h9"/>`),
  todo: I(`<circle cx="12" cy="12" r="9.5" stroke-dasharray="3.2 2.6"/><path d="M12 7.5V12l3 2"/>`),
};

const COLS = [
  { cls: "real", icon: ICON.real, label: "Tested on real data", items: [
    ["Model A · Detect", "<b>32%</b> of real errors caught", "simple method: 8%"],
    ["Model B · Rank zeros", "<b>All 157</b> known errors ranked High", "with 30% of normal zeros"]] },
  { cls: "sim", icon: ICON.sim, label: "Simulation only", items: [
    ["Facility network", "<b>506</b> facilities on 126 real places", "right hub found in 72% of outages"],
    ["Model B · Plan", "<b>6×</b> more reports recovered", "176 vs 29 a year, same staff hours"]] },
  { cls: "todo", icon: ICON.todo, label: "Not yet validated", items: [
    ["Recovery after real actions", "<b>Not measured</b> yet", "needs a field pilot"],
    ["Real reporting pathways", "<b>Not available</b> yet", "the network is synthetic"]] },
];
const NEXT = ["Get real reporting pathways from RESUs", "Pilot with one RESU, settings frozen", "Measure recovery after real actions"];

const mark = `data:image/png;base64,${readFileSync(resolve(ROOT, "docs/brand/iris-mark-bright-teal.png")).toString("base64")}`;
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  :root { --teal: #3FC1B0; --aqua: #4BF7FF; --amber: #F2B544; --slate: #8FA3B1; --ink: #FFFFFF; --sub: #AEB8BC; --line: #3A3F42; --chip: #2C3134; }
  body { width: 1920px; height: 1080px; background: #232323; color: var(--ink); font-family: Poppins, Inter, system-ui, sans-serif; position: relative; overflow: hidden; }
  .logo { position: absolute; left: 70px; top: 52px; display: flex; align-items: center; gap: 10px; }
  .logo img { height: 34px; }
  .logo span { font-weight: 600; font-size: 30px; letter-spacing: .04em; color: var(--teal); }
  h1 { position: absolute; left: 0; right: 0; top: 54px; text-align: center; font-size: 46px; font-weight: 700; letter-spacing: .02em; }
  h1 small { display: block; font-size: 17px; font-weight: 600; letter-spacing: .32em; color: var(--teal); margin-top: 2px; }

  .cols { position: absolute; left: 70px; right: 70px; top: 180px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 34px; }
  .col { border: 3px solid var(--c); border-radius: 16px; padding: 22px 28px 26px; height: 372px; }
  .col.real { --c: var(--teal); } .col.sim, .col.todo { --c: var(--teal); } .col.todo { border-style: dashed; }
  .status { display: flex; align-items: center; gap: 12px; color: var(--c); font-size: 22px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  .item { margin-top: 26px; padding-top: 20px; border-top: 1.5px solid var(--line); }
  .item h3 { font-size: 17px; font-weight: 600; color: var(--sub); letter-spacing: .02em; }
  .item p { font-size: 24px; font-weight: 500; margin-top: 6px; line-height: 1.25; }
  .item p b { color: var(--c); font-weight: 700; }
  .item p b { color: var(--aqua) !important; }
  .item small { display: block; font-size: 16px; color: var(--sub); margin-top: 4px; }

  .next { position: absolute; left: 70px; right: 70px; top: 610px; }
  .next h3 { font-size: 20px; font-weight: 700; letter-spacing: .12em; color: var(--teal); }
  .steps { display: grid; grid-template-columns: 1fr 50px 1fr 50px 1fr; align-items: center; margin-top: 16px; }
  .step { display: flex; align-items: center; gap: 16px; background: var(--chip); border-radius: 12px; padding: 18px 22px; height: 92px; }
  .step span { flex-shrink: 0; width: 44px; height: 44px; border-radius: 99px; background: var(--teal); color: #10322E; display: grid; place-items: center; font-size: 22px; font-weight: 700; }
  .step p { font-size: 20px; font-weight: 500; line-height: 1.25; }
  .arrow { display: grid; place-items: center; }

  .foot { position: absolute; left: 70px; right: 70px; top: 838px; text-align: center; }
  .foot p { font-size: 38px; font-weight: 600; }
  .foot p b { color: var(--aqua); }
  .foot small { display: block; font-size: 20px; color: var(--sub); margin-top: 6px; }
  .fine { position: absolute; left: 70px; right: 70px; bottom: 24px; text-align: center; font-size: 12.5px; line-height: 1.6; color: var(--sub); }
  .fine b { color: var(--ink); font-weight: 600; }
</style></head><body>
  <div class="logo"><img src="${mark}" alt=""><span>IRIS</span></div>
  <h1>WHERE IRIS STANDS<small>PROGRESS, LIMITS AND NEXT STEPS</small></h1>

  <div class="cols">${COLS.map((c) => `<div class="col ${c.cls}">
    <div class="status">${c.icon}${c.label}</div>
    ${c.items.map(([h, p, s]) => `<div class="item"><h3>${h}</h3><p>${p}</p><small>${s}</small></div>`).join("")}
  </div>`).join("")}</div>

  <div class="next"><h3>NEXT STEPS</h3>
    <div class="steps">${NEXT.map((t, i) => `<div class="step"><span>${i + 1}</span><p>${t}</p></div>`).join(`<div class="arrow"><svg width="34" height="20" viewBox="0 0 34 20"><path d="M3 10h26M21 3l8 7-8 7" fill="none" stroke="#3FC1B0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`)}</div>
  </div>

  <div class="foot"><p>IRIS <b>supports</b> surveillance staff. It does not replace them.</p>
    <small>Every flag is checked by a person before anything changes.</small></div>

  <p class="fine"><b>Sources:</b> IRIS Model A evaluation report (3% alert limit); zero-report prioritizer report; IRIS results summary (20 simulation runs, 24 staff-hours a week).
    <br>Real 2020 results are a second look, not a fresh test. Data: DOH Epidemiology Bureau via HDX (dengue, 2016–2021).</p>
</body></html>`;

const tmp = mkdtempSync(join(tmpdir(), "iris-slide-"));
const file = join(tmp, "slide.html");
writeFileSync(file, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const overflow = await page.evaluate(() => [...document.querySelectorAll(".col, .step")].filter((b) => b.scrollHeight > b.clientHeight + 1).length);
await page.screenshot({ path: OUT });
await browser.close();
console.log(`Wrote ${OUT} (overflowing boxes: ${overflow})`);
