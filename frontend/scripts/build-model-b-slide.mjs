// Builds a 16:9 pitch-deck slide for Model B (Prioritize) in the style of the deck's Model A slide:
//   docs/slides/IRIS-Model-B-Prioritize.png (3840×2160)
// The plan shown is the planner's real 2020 output (models/pipeline/outputs/model_b/plan_real_2020.csv) for one week;
// the simulation figures are from models/pipeline/outputs/model_b/report_b.md. No servers needed.
// Usage: node scripts/build-model-b-slide.mjs [week_start, default 2020-11-01]
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "../..");
const WEEK = process.argv[2] ?? "2020-11-01";
const OUT = resolve(ROOT, "docs/slides/IRIS-Model-B-Prioritize.png");
mkdirSync(resolve(ROOT, "docs/slides"), { recursive: true });

const csv = (file) => {
  const [head, ...lines] = readFileSync(file, "utf8").trim().split("\n");
  const cols = head.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
};
const plan = csv(resolve(ROOT, "models/pipeline/outputs/model_b/plan_real_2020.csv")).filter((r) => r.week_start === WEEK);
if (!plan.length) throw new Error(`no plan rows for ${WEEK}`);
const locs = csv(resolve(ROOT, "models/data/shared/locations.csv"));
const placeName = Object.fromEntries(locs.map((l) => [l.location_id, l.location]));
const placeType = Object.fromEntries(locs.map((l) => [l.location_id, l.location_type]));
const regionName = Object.fromEntries(locs.map((l) => [l.region_id, l.region]));
const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Del|De|Of)\b/g, (w) => w.toLowerCase());

const rows = plan.map((r) => {
  const n = r.locations.split(";").length;
  const resu = r.action === "call_resu";
  const region = (regionName[r.region_id] ?? r.region_id).replace(/^Region ([IVXL]+) - (.*)$/, "Region $1 ($2)");
  return {
    who: resu ? `${region} RESU` : title(placeName[r.target] ?? r.target),
    what: resu ? `One call covers ${n} places reporting zero · about ${Math.round(+r.expected_cases)} cases expected`
      : `Call the ${placeType[r.target] ?? "place"} · reported ${r.reported_cases}, about ${Math.round(+r.expected_cases)} expected`,
    hours: +r.hours, gain: +r.expected_cases_recovered, resu, n,
    short: resu ? `${region.replace(/ \(.*\)$/, "")} RESU` : title(placeName[r.target] ?? r.target),
  };
});
const used = rows.reduce((a, r) => a + r.hours, 0);
const gain = rows.reduce((a, r) => a + r.gain, 0);
const maxGain = Math.max(...rows.map((r) => r.gain));
const BUDGET = 24;
const SHOW = 5;  // rows listed; the rest are summed in one line
const rest = rows.slice(SHOW);
const date = new Date(WEEK + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const mark = `data:image/png;base64,${readFileSync(resolve(ROOT, "docs/brand/iris-mark-bright-teal.png")).toString("base64")}`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  :root { --teal: #3FC1B0; --aqua: #4BF7FF; --violet: #7C3AED; --coral: #F07167; --amber: #F2B544; --ink: #FFFFFF; --sub: #AEB8BC; --line: #3A3F42; }
  body { width: 1920px; height: 1080px; background: #232323; color: var(--ink); font-family: Poppins, Inter, system-ui, sans-serif; position: relative; overflow: hidden; }
  .logo { position: absolute; left: 70px; top: 52px; display: flex; align-items: center; gap: 10px; }
  .logo img { height: 34px; }
  .logo span { font-weight: 600; font-size: 30px; letter-spacing: .04em; color: var(--teal); }
  h1 { position: absolute; left: 0; right: 0; top: 54px; text-align: center; font-size: 46px; font-weight: 700; letter-spacing: .02em; }
  h1 small { display: block; font-size: 17px; font-weight: 600; letter-spacing: .32em; color: var(--teal); margin-top: 2px; }

  .panel { position: absolute; left: 70px; top: 170px; width: 1120px; height: 690px; border: 3px solid var(--violet); padding: 22px 30px; }
  .panel h2 { font-size: 30px; font-weight: 700; }
  .panel .note { font-size: 16px; color: var(--sub); margin-top: 2px; }
  .meter { margin-top: 18px; }
  .meter .lab { display: flex; justify-content: space-between; font-size: 17px; color: var(--sub); margin-bottom: 6px; }
  .meter .lab b { color: var(--ink); font-weight: 600; }
  .bar { display: flex; height: 22px; border-radius: 4px; overflow: hidden; background: #34393C; gap: 2px; }
  .bar span { display: block; height: 100%; }
  .list { margin-top: 18px; display: grid; gap: 28px; }
  .row { display: grid; grid-template-columns: 34px 1fr 76px 300px; align-items: center; gap: 14px; padding: 8px 10px; border-radius: 6px; }
  .row.first { background: rgb(63 193 176 / .12); outline: 1.5px solid var(--teal); }
  .rank { width: 30px; height: 30px; border-radius: 99px; display: grid; place-items: center; font-size: 15px; font-weight: 700; background: #34393C; }
  .first .rank { background: var(--teal); color: #10322E; }
  .who { font-size: 22px; font-weight: 600; line-height: 1.2; }
  .what { font-size: 15px; color: var(--sub); line-height: 1.3; }
  .hrs { font-size: 18px; color: var(--sub); text-align: right; font-variant-numeric: tabular-nums; }
  .gain { display: flex; align-items: center; gap: 10px; font-size: 18px; color: var(--sub); font-variant-numeric: tabular-nums; }
  .gain i { display: block; height: 12px; border-radius: 3px; background: var(--teal); }
  .first .gain i { background: var(--aqua); }
  .tag { position: absolute; right: 30px; top: 26px; font-size: 13px; font-weight: 600; color: #10322E; background: var(--teal); padding: 5px 12px; border-radius: 99px; }
  .colhead { display: grid; grid-template-columns: 34px 1fr 76px 300px; gap: 14px; padding: 0 10px; margin-top: 22px; font-size: 13px; color: var(--sub); text-transform: uppercase; letter-spacing: .08em; }
  .colhead span:nth-child(3) { text-align: right; }

  .side { position: absolute; left: 1240px; top: 170px; width: 610px; }
  .side h3 { text-align: center; font-size: 32px; font-weight: 700; color: var(--teal); letter-spacing: .04em; }
  .side h3::after { content: ""; display: block; width: 280px; height: 2px; margin: 6px auto 0; background: var(--teal); }
  .steps { margin-top: 30px; display: grid; gap: 28px; }
  .step { display: grid; grid-template-columns: 50px 1fr; gap: 16px; align-items: start; }
  .num { width: 46px; height: 46px; border-radius: 99px; background: var(--teal); color: #10322E; display: grid; place-items: center; font-size: 24px; font-weight: 700; }
  .step b { display: block; font-size: 22px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; line-height: 1.2; }
  .step p { font-size: 17px; color: var(--sub); line-height: 1.35; margin-top: 3px; }
  .out { margin-top: 34px; border: 3px solid var(--teal); padding: 16px 26px 18px; }
  .out h4 { text-align: center; font-size: 26px; font-weight: 700; color: var(--teal); letter-spacing: .04em; margin-bottom: 8px; }
  .kv { display: grid; grid-template-columns: 200px 22px 1fr; row-gap: 12px; font-size: 19px; }
  .kv .k { color: var(--ink); } .kv .c { color: var(--teal); } .kv .v { color: var(--ink); }
  .warn { color: var(--amber) !important; font-weight: 600; }
  .vs { text-align: center; font-size: 14px; color: var(--sub); margin: -4px 0 14px; }
  .res { display: grid; grid-template-columns: 1fr 96px 80px; row-gap: 12px; align-items: baseline; font-size: 18px; }
  .res .v { text-align: right; font-weight: 700; color: var(--aqua); font-variant-numeric: tabular-nums; }
  .res .b { text-align: right; color: var(--sub); font-variant-numeric: tabular-nums; }
  .foot { position: absolute; left: 70px; right: 70px; top: 880px; text-align: center; font-size: 34px; line-height: 1.3; font-weight: 500; }
  .fine { position: absolute; left: 70px; right: 70px; bottom: 26px; text-align: center; font-size: 13px; line-height: 1.6; color: var(--sub); }
  .fine b { color: var(--ink); font-weight: 600; }
</style></head><body>
  <div class="logo"><img src="${mark}" alt=""><span>IRIS</span></div>
  <h1>MODEL B<small>PRIORITIZE</small></h1>

  <div class="panel">
    <h2>What to investigate first</h2>
    <p class="note">Model output on real data · week of ${date}</p>
    <span class="tag">Shared source first</span>
    <div class="meter">
      <div class="lab"><span>Staff hours</span><span><b>${used.toFixed(1)} / ${BUDGET} h</b></span></div>
      <div class="bar">${rows.map((r) => `<span style="width:${(r.hours / BUDGET) * 100}%;background:${r.resu ? "var(--aqua)" : "var(--teal)"};opacity:${r.resu ? 1 : 0.75}"></span>`).join("")}</div>
    </div>
    <div class="colhead"><span></span><span>Action</span><span>Hours</span><span>Cases recovered (est.)</span></div>
    <div class="list">
      ${rows.slice(0, SHOW).map((r, i) => `<div class="row${i === 0 ? " first" : ""}"><span class="rank">${i + 1}</span>
        <div><div class="who">${r.resu ? `Call ${r.who}` : r.who}</div>${r.resu ? `<div class="what">${r.n} places at zero, one call</div>` : ""}</div>
        <span class="hrs">${r.hours.toFixed(1)}</span>
        <span class="gain"><i style="width:${Math.max(4, (r.gain / maxGain) * 220)}px"></i>${r.gain.toFixed(1)}</span></div>`).join("")}
      ${rest.length ? `<div class="row"><span class="rank">+</span><div><div class="who">${rest.length} more calls</div></div>
        <span class="hrs">${rest.reduce((a, r) => a + r.hours, 0).toFixed(1)}</span>
        <span class="gain"><i style="width:${Math.max(4, (rest.reduce((a, r) => a + r.gain, 0) / maxGain) * 220)}px"></i>${rest.reduce((a, r) => a + r.gain, 0).toFixed(1)}</span></div>` : ""}
    </div>
  </div>

  <div class="side">
    <h3>HOW IT WORKS</h3>
    <div class="steps">
      <div class="step"><span class="num">1</span><div><b>Score each lead</b><p>Failure risk × cases at stake</p></div></div>
      <div class="step"><span class="num">2</span><div><b>Price each action</b><p>Staff hours, cost, success rate</p></div></div>
      <div class="step"><span class="num">3</span><div><b>Solve with HiGHS</b><p>Best plan within ${BUDGET} h and ₱10,000</p></div></div>
    </div>
    <div class="out">
      <h4>RESULTS</h4>
      <p class="vs">Model B vs fixing facilities one by one*</p>
      <div class="res">
        <span class="k">Reports recovered / year</span><span class="v">176</span><span class="b">29</span>
        <span class="k">Recovered per staff-hour</span><span class="v">0.14</span><span class="b">0.02</span>
        <span class="k">Weeks to fix a shared failure</span><span class="v">2.7</span><span class="b">4.7</span>
        <span class="k">Cases left unreported</span><span class="v">2,428</span><span class="b">3,881</span>
        <span class="k">Field-validated</span><span class="v warn">Not yet</span><span class="b"></span>
      </div>
    </div>
  </div>

  <p class="foot">IRIS shows where to look first.<br>Recovery gains are simulated, not yet validated.</p>
  <p class="fine"><b>Data:</b> DOH Epidemiology Bureau, Philippine dengue cases and deaths 2016–2021, via the Humanitarian Data Exchange (data.humdata.org/dataset/philippine-dengue-cases-and-deaths). Plan: IRIS Model B on 2020 data; hours and budget are planning assumptions.<br>
    * Simulation: 20 runs on a synthetic reporting network, 24 staff-hours a week, Model B vs fixing facilities one by one. Source: IRIS Model B evaluation report.</p>
</body></html>`;

const tmp = mkdtempSync(join(tmpdir(), "iris-slide-"));
const file = join(tmp, "slide.html");
writeFileSync(file, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const font = await page.evaluate(() => document.fonts.check("700 20px Poppins"));
await page.screenshot({ path: OUT });
await browser.close();
console.log(`Wrote ${OUT} (${rows.length} actions, ${used} h, Poppins ${font ? "loaded" : "not available, used fallback"})`);
