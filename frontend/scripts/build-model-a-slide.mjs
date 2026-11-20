// Builds a 16:9 pitch-deck slide for Model A (Detect), matching the Model B slide:
//   docs/slides/IRIS-Model-A-Detect.png (3840×2160)
// The chart is Model A v2's real 2020 output for one place (models/pipeline/outputs/model_a_v2/scores_v2.csv), with the
// swapped reports found during data cleaning (models/data/dengue/clean/dengue_province_weekly.csv). The summary figures
// are from models/pipeline/outputs/model_a_v2/eval_report.md (run 3, 3% alert limit). No servers needed.
// Usage: node scripts/build-model-a-slide.mjs
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "../..");
const PLACE = "R12-NORTH_COTABATO", NAME = "North Cotabato";
const FROM = "2020-07-19", TO = "2020-11-08", FOCUS = "2020-09-06";
const OUT = resolve(ROOT, "docs/slides/IRIS-Model-A-Detect.png");
mkdirSync(resolve(ROOT, "docs/slides"), { recursive: true });

// Quote-aware CSV reader (the clean table has quoted fields).
const csv = (file, keep) => {
  const [head, ...lines] = readFileSync(file, "utf8").trim().split("\n");
  const cols = head.split(",");
  const split = (l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((v) => v.replace(/,$/, "").replace(/^"|"$/g, ""));
  return lines.filter(keep).map((l) => Object.fromEntries(split(l).map((v, i) => [cols[i], v])));
};
const scores = csv(resolve(ROOT, "models/pipeline/outputs/model_a_v2/scores_v2.csv"), (l) => l.startsWith("dengue,") && l.includes(PLACE));
const clean = csv(resolve(ROOT, "models/data/dengue/clean/dengue_province_weekly.csv"), (l) => l.includes(PLACE));
const qa = Object.fromEntries(clean.map((r) => [r.week_start, r]));
const tau = JSON.parse(readFileSync(resolve(ROOT, "models/pipeline/outputs/model_a_v2/config.json"), "utf8")).TAU_model_a_v2;

const weeks = scores.filter((r) => r.period_start >= FROM && r.period_start <= TO).sort((a, b) => a.period_start.localeCompare(b.period_start))
  .map((r) => ({ d: r.period_start, y: +r.cases, e: +r.expected, lo: +r.pi_low, hi: +r.pi_high, pLow: +r.p_low, pFail: +r.p_fail,
    flag: r.flag === "1.0" || r.flag === "1", swap: (qa[r.period_start]?.qa_flag ?? "").includes("swap"), truth: +(qa[r.period_start]?.cases_fixed ?? NaN) }));
const swaps = weeks.filter((w) => w.swap), caught = swaps.filter((w) => w.flag), falseFlags = weeks.filter((w) => w.flag && !w.swap);
const f = weeks.find((w) => w.d === FOCUS);
if (!f?.flag || !f.swap) throw new Error("focus week is not a flagged swap");

const fmt = (d, o) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", ...o });
const md = (d) => fmt(d, { month: "short", day: "numeric" });
const end = (d) => new Date(Date.parse(d + "T00:00:00Z") + 6 * 864e5).toISOString().slice(0, 10);

// Chart geometry (CSS px).
const CW = 1060, CH = 380, L = 54, R = 30, T = 12, B = 40;
const yMax = 25 * Math.ceil(Math.max(...weeks.map((w) => Math.max(w.hi, w.y))) / 25);
const x = (i) => L + (i * (CW - L - R)) / (weeks.length - 1);
const y = (v) => T + (1 - v / yMax) * (CH - T - B);
const pts = (k) => weeks.map((w, i) => `${x(i).toFixed(1)},${y(w[k]).toFixed(1)}`).join(" ");
const band = `${pts("hi")} ${weeks.map((w, i) => `${x(i).toFixed(1)},${y(w.lo).toFixed(1)}`).reverse().join(" ")}`;
const fi = weeks.indexOf(f);
const svg = `<svg width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}" font-family="Poppins, sans-serif">
  ${Array.from({ length: yMax / 25 + 1 }, (_, k) => k * 25).map((v) => `<line x1="${L}" x2="${CW - R}" y1="${y(v)}" y2="${y(v)}" stroke="#3A3F42" stroke-width="1"/>
    <text x="${L - 12}" y="${y(v) + 5}" fill="#AEB8BC" font-size="14" text-anchor="end">${v}</text>`).join("")}
  ${weeks.map((w, i) => i % 2 === 0 ? `<text x="${x(i)}" y="${CH - 12}" fill="#AEB8BC" font-size="14" text-anchor="middle">${md(w.d)}</text>` : "").join("")}
  <polygon points="${band}" fill="#3FC1B0" fill-opacity=".22"/>
  <polyline points="${pts("e")}" fill="none" stroke="#3FC1B0" stroke-width="3" stroke-linejoin="round"/>
  <polyline points="${pts("y")}" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>
  ${weeks.map((w, i) => w.flag
    ? `<circle cx="${x(i)}" cy="${y(w.y)}" r="${i === fi ? 9 : 7}" fill="#F07167" stroke="#232323" stroke-width="2.5"/>`
    : `<circle cx="${x(i)}" cy="${y(w.y)}" r="5" fill="#FFFFFF" stroke="#232323" stroke-width="2"/>`).join("")}
  <circle cx="${x(fi)}" cy="${y(f.y)}" r="16" fill="none" stroke="#F07167" stroke-width="2"/>
  <line x1="${x(fi) + 10}" y1="${y(f.y) - 13}" x2="${x(fi) + 40}" y2="${y(yMax - 30) + 8}" stroke="#F07167" stroke-width="1.5"/>
  <text x="${x(fi) + 46}" y="${y(yMax - 30) - 14}" fill="#F07167" font-size="17" font-weight="700">Far below expected: flagged</text>
  <text x="${x(fi) + 46}" y="${y(yMax - 30) + 8}" fill="#F07167" font-size="15">Reported ${f.y}, expected about ${Math.round(f.e)} · the 4 swaps after it flagged too</text>
</svg>`;

const mark = `data:image/png;base64,${readFileSync(resolve(ROOT, "docs/brand/iris-mark-bright-teal.png")).toString("base64")}`;
const pLowText = f.pLow < 1e-6 ? "&lt; 0.000001" : f.pLow.toPrecision(2);

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

  .panel { position: absolute; left: 70px; top: 170px; width: 1120px; height: 690px; border: 3px solid var(--violet); padding: 22px 27px; }
  .panel h2 { font-size: 30px; font-weight: 700; }
  .panel .note { font-size: 16px; color: var(--sub); margin-top: 2px; }
  .tag { position: absolute; right: 30px; top: 26px; font-size: 13px; font-weight: 600; color: #10322E; background: var(--teal); padding: 5px 12px; border-radius: 99px; }
  .legend { display: flex; gap: 30px; margin: 16px 0 8px; font-size: 15px; color: var(--sub); align-items: center; }
  .legend span { display: inline-flex; align-items: center; gap: 9px; }
  .sw-line { width: 26px; height: 3px; background: var(--teal); border-radius: 2px; }
  .sw-band { width: 26px; height: 14px; background: rgb(63 193 176 / .3); border-radius: 2px; }
  .sw-rep { width: 26px; height: 2px; background: #fff; position: relative; }
  .sw-rep::after { content: ""; position: absolute; left: 9px; top: -4px; width: 8px; height: 8px; border-radius: 99px; background: #fff; }
  .sw-flag { width: 14px; height: 14px; border-radius: 99px; background: var(--coral); }
  .stats { position: absolute; left: 27px; right: 27px; bottom: 20px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .stat { border-top: 2px solid var(--line); padding-top: 10px; }
  .stat b { font-size: 34px; font-weight: 700; color: var(--aqua); font-variant-numeric: tabular-nums; }
  .stat b small { font-size: 16px; font-weight: 500; color: var(--sub); margin-left: 8px; }
  .stat p { font-size: 15px; color: var(--sub); line-height: 1.3; }

  .side { position: absolute; left: 1240px; top: 170px; width: 610px; }
  .side h3 { text-align: center; font-size: 32px; font-weight: 700; color: var(--teal); letter-spacing: .04em; }
  .side h3::after { content: ""; display: block; width: 280px; height: 2px; margin: 6px auto 0; background: var(--teal); }
  .steps { margin-top: 24px; display: grid; gap: 18px; }
  .step { display: grid; grid-template-columns: 50px 1fr; gap: 16px; align-items: start; }
  .num { width: 46px; height: 46px; border-radius: 99px; background: var(--teal); color: #10322E; display: grid; place-items: center; font-size: 24px; font-weight: 700; }
  .step b { display: block; font-size: 21px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; line-height: 1.2; }
  .step p { font-size: 16px; color: var(--sub); line-height: 1.35; margin-top: 2px; }
  .out { margin-top: 24px; border: 3px solid var(--teal); padding: 14px 26px 16px; }
  .out h4 { text-align: center; font-size: 26px; font-weight: 700; color: var(--teal); letter-spacing: .04em; }
  .vs { text-align: center; font-size: 14px; color: var(--sub); margin: 0 0 10px; }
  .kv { display: grid; grid-template-columns: 150px 22px 1fr; row-gap: 9px; font-size: 18px; align-items: baseline; }
  .kv .c { color: var(--teal); }
  .kv .v small { color: var(--sub); font-size: 14px; margin-left: 6px; }
  .kv .hit { color: var(--coral); font-weight: 600; }
  .kv .ok { color: var(--aqua); font-weight: 600; }
  .foot { position: absolute; left: 70px; right: 70px; top: 880px; text-align: center; font-size: 34px; line-height: 1.3; font-weight: 500; }
  .fine { position: absolute; left: 70px; right: 70px; bottom: 26px; text-align: center; font-size: 13px; line-height: 1.6; color: var(--sub); }
  .fine b { color: var(--ink); font-weight: 600; }
</style></head><body>
  <div class="logo"><img src="${mark}" alt=""><span>IRIS</span></div>
  <h1>MODEL A<small>DETECT</small></h1>

  <div class="panel">
    <h2>Expected vs reported cases</h2>
    <p class="note">Model output on real data · ${NAME}, dengue, ${md(FROM)} – ${fmt(end(TO), { month: "short", day: "numeric", year: "numeric" })}</p>
    <span class="tag">${caught.length} of ${swaps.length} real errors flagged</span>
    <div class="legend">
      <span><i class="sw-line"></i>Expected count</span><span><i class="sw-band"></i>90% range</span>
      <span><i class="sw-rep"></i>Reported cases</span><span><i class="sw-flag"></i>Flagged</span>
    </div>
    ${svg}
    <div class="stats">
      <div class="stat"><b>32%</b><p>of real 2020 errors caught<br>(best simple method 8%)*</p></div>
      <div class="stat"><b>10%</b><p>of normal weeks flagged<br>(best simple method 2%)*</p></div>
      <div class="stat"><b>15%</b><p>false region-wide alerts<br>(earlier version 71%)*</p></div>
    </div>
  </div>

  <div class="side">
    <h3>HOW IT WORKS</h3>
    <div class="steps">
      <div class="step"><span class="num">1</span><div><b>Learn from past weeks only</b><p>Each week is predicted before it is seen</p></div></div>
      <div class="step"><span class="num">2</span><div><b>Account for trend and season</b><p>Long-term trend, yearly season, holidays</p></div></div>
      <div class="step"><span class="num">3</span><div><b>Compare reported vs expected</b><p>Is the count inside the 90% range?</p></div></div>
      <div class="step"><span class="num">4</span><div><b>Flag only the most unlikely</b><p>About 3% of normal weeks, set on 2019 data</p></div></div>
    </div>
    <div class="out">
      <h4>OUTPUT</h4>
      <p class="vs">${NAME} · week of ${fmt(FOCUS, { month: "short", day: "numeric", year: "numeric" })}</p>
      <div class="kv">
        <span>Reported</span><span class="c">:</span><span class="v">${f.y} cases</span>
        <span>Expected</span><span class="c">:</span><span class="v">~${Math.round(f.e)}<small>90% range ${Math.round(f.lo)}–${Math.round(f.hi)}</small></span>
        <span>p_low</span><span class="c">:</span><span class="v hit">${pLowText}<small>flag if &lt; ${tau.toFixed(3)}</small></span>
        <span>p_fail</span><span class="c">:</span><span class="v">${f.pFail.toFixed(2)}<small>chance the report is wrong</small></span>
        <span>Checked</span><span class="c">:</span><span class="v ok">Real error<small>cases entered as deaths · true count ${f.truth}</small></span>
      </div>
    </div>
  </div>

  <p class="foot">IRIS doesn't assume a decline is a failure.<br>It identifies reports that deserve investigation.</p>
  <p class="fine"><b>Data:</b> DOH Epidemiology Bureau, Philippine dengue cases and deaths 2016–2021, via the Humanitarian Data Exchange (data.humdata.org/dataset/philippine-dengue-cases-and-deaths). Chart: IRIS Model A v2 on 2020 data; swapped reports found during data cleaning.<br>
    * Real 2020 test: 158 known swapped reports; best simple method is EWMA. Alert limit set on 2019 data. 2020 was reviewed more than once, so it is a second look, not an independent test. Source: IRIS Model A evaluation report.</p>
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
console.log(`Wrote ${OUT} (${weeks.length} weeks, ${caught.length}/${swaps.length} swaps flagged, ${falseFlags.length} false flags, Poppins ${font ? "loaded" : "fallback"})`);
