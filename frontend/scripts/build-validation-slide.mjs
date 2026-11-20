// Builds a 16:9 pitch-deck slide on model validation, matching the Model A and Model B slides:
//   docs/slides/IRIS-Model-Validation.png (3840×2160)
// Detection and transfer figures are from models/pipeline/outputs/model_a_v2/eval_report.md (run 3, 3% alert limit).
// The 2020 alert count and the 2019 week 8 cross-disease event are read from scores_v2.csv. No servers needed.
// Usage: node scripts/build-validation-slide.mjs
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(ROOT, "docs/slides/IRIS-Model-Validation.png");
mkdirSync(resolve(ROOT, "docs/slides"), { recursive: true });

// --- Saved Model A outputs.
const [head, ...lines] = readFileSync(resolve(ROOT, "models/pipeline/outputs/model_a_v2/scores_v2.csv"), "utf8").trim().split("\n");
const cols = head.split(",");
const rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
const flagged = (r) => r.flag === "1.0" || r.flag === "1";
const d2020 = rows.filter((r) => r.disease === "dengue" && r.location_id !== "PH" && r.period_start.startsWith("2020") && r.report_status === "reported");
const alerts2020 = d2020.filter(flagged).length;
const places = new Set(d2020.map((r) => r.location_id)).size;
const W8 = "2019-02-17";   // 2019 morbidity week 8
const NAMES = { acute_bloody_diarrhea: "Bloody diarrhea", afp: "AFP", chikungunya: "Chikungunya", measles: "Measles",
  neonatal_tetanus: "Neonatal tetanus", non_neonatal_tetanus: "Tetanus (non-neonatal)", rotavirus: "Rotavirus", rubella: "Rubella" };
const national = rows.filter((r) => r.resolution === "week" && r.disease !== "dengue" && r.period_start === W8);
const zeros = national.filter((r) => r.cases === "0.0" || r.cases === "0").map((r) => ({ name: NAMES[r.disease] ?? r.disease, flag: flagged(r) }))
  .sort((a, b) => b.flag - a.flag || a.name.localeCompare(b.name));
// All diseases in the national weekly report (dengue is one of them; Model A scores it by province, not here).
const nDiseases = new Set(rows.filter((r) => r.resolution === "week").map((r) => r.disease)).size;


// --- From eval_report.md, "2020 test: headline results" (158 real swaps). Baseline: EWMA, the best simple method.
const N = 158;
const IRIS = { rec: 0.323, far: 0.101 }, SIMPLE = { rec: 0.076, far: 0.021 };
const caught = Math.round(IRIS.rec * N);
const oneIn = Math.round(alerts2020 / caught);
const flaggedZeros = zeros.filter((z) => z.flag).length;
const times = Math.floor(IRIS.rec / SIMPLE.rec);
const BAR = 1100;   // px for 100%

const warn = `<svg viewBox="0 0 40 40" width="26" height="26" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"><path d="M20 5 37 34H3Z"/><path d="M20 15v9M20 29v.5"/></svg>`;
const mark = `data:image/png;base64,${readFileSync(resolve(ROOT, "docs/brand/iris-mark-bright-teal.png")).toString("base64")}`;
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  :root { --teal: #3FC1B0; --aqua: #4BF7FF; --amber: #F2B544; --slate: #8FA3B1; --ink: #FFFFFF; --sub: #AEB8BC; --line: #3A3F42; }
  body { width: 1920px; height: 1080px; background: #232323; color: var(--ink); font-family: Poppins, Inter, system-ui, sans-serif; position: relative; overflow: hidden; }
  .logo { position: absolute; left: 70px; top: 52px; display: flex; align-items: center; gap: 10px; }
  .logo img { height: 34px; }
  .logo span { font-weight: 600; font-size: 30px; letter-spacing: .04em; color: var(--teal); }
  h1 { position: absolute; left: 0; right: 0; top: 54px; text-align: center; font-size: 46px; font-weight: 700; letter-spacing: .02em; }
  h1 small { display: block; font-size: 17px; font-weight: 600; letter-spacing: .32em; color: var(--teal); margin-top: 2px; }

  .hero { position: absolute; left: 160px; right: 160px; top: 215px; }
  .hero h2 { font-size: 54px; font-weight: 700; line-height: 1.1; }
  .hero h2 b { color: var(--aqua); }
  .hero p { font-size: 21px; color: var(--sub); margin-top: 10px; }
  .bars { margin-top: 44px; display: grid; gap: 26px; }
  .row { display: grid; grid-template-columns: 300px 1fr; align-items: center; }
  .row .who { font-size: 24px; font-weight: 600; }
  .row .who small { display: block; font-size: 16px; font-weight: 400; color: var(--sub); }
  .track { display: flex; align-items: center; gap: 18px; }
  .track i { display: block; height: 46px; border-radius: 0 8px 8px 0; }
  .track b { font-size: 46px; font-weight: 700; }
  .track span { font-size: 18px; color: var(--sub); margin-left: 6px; }

  .stats { position: absolute; left: 160px; right: 160px; top: 690px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 50px; }
  .stats div { border-top: 3px solid var(--teal); padding-top: 16px; }
  .stats b { display: block; font-size: 52px; font-weight: 700; line-height: 1.05; color: var(--aqua); }
  .stats p { font-size: 20px; color: var(--sub); margin-top: 4px; }

  .lim { position: absolute; left: 0; right: 0; top: 905px; display: flex; justify-content: center; gap: 46px; font-size: 20px; font-weight: 500; }
  .lim span { display: inline-flex; align-items: center; gap: 10px; }
  .lim svg { color: var(--amber); }
  .fine { position: absolute; left: 70px; right: 70px; bottom: 24px; text-align: center; font-size: 12.5px; line-height: 1.6; color: var(--sub); }
  .fine b { color: var(--ink); font-weight: 600; }
</style></head><body>
  <div class="logo"><img src="${mark}" alt=""><span>IRIS</span></div>
  <h1>MODEL VALIDATION<small>HOW WELL DOES IRIS PERFORM?</small></h1>

  <div class="hero">
    <h2>IRIS catches <b>${times}× more</b> real reporting errors</h2>
    <p>${N} known errors in real 2020 dengue reports</p>
    <div class="bars">
      <div class="row"><span class="who">IRIS</span>
        <div class="track"><i style="width:${IRIS.rec * BAR}px;background:var(--aqua)"></i><b style="color:var(--aqua)">${Math.round(IRIS.rec * 100)}%</b><span>${Math.round(IRIS.far * 100)}% false alerts</span></div></div>
      <div class="row"><span class="who">Simple method<small>EWMA, the best of three</small></span>
        <div class="track"><i style="width:${SIMPLE.rec * BAR}px;background:var(--slate)"></i><b>${Math.round(SIMPLE.rec * 100)}%</b><span>${Math.round(SIMPLE.far * 100)}% false alerts</span></div></div>
    </div>
  </div>

  <div class="stats">
    <div><b>${alerts2020}</b><p>alerts in 2020, about ${Math.round(alerts2020 / 53)} a week</p></div>
    <div><b>1 in ${oneIn}</b><p>alerts is a real error</p></div>
    <div><b>${flaggedZeros} of ${zeros.length}</b><p>diseases flagged in a shared zero week</p></div>
  </div>

  <div class="lim"><span>${warn}Only one error type labeled</span><span>${warn}2020 is a second look, not a fresh test</span></div>

  <p class="fine"><b>Data:</b> DOH Epidemiology Bureau via HDX (dengue, 2016–2021); DOH EDCS/PIDSR weekly reports, compiled by S. J. Parreño (18 diseases, 2019 week 8).
    <br><b>Source:</b> IRIS Model A evaluation report, 3% alert limit. Errors: 581 swapped reports found while cleaning the data, 158 of them in 2020.</p>
</body></html>`;

const tmp = mkdtempSync(join(tmpdir(), "iris-slide-"));
const file = join(tmp, "slide.html");
writeFileSync(file, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: OUT });
await browser.close();
console.log(`Wrote ${OUT} (${times}x, ${alerts2020} alerts, 1 in ${oneIn} real, ${flaggedZeros}/${zeros.length} diseases)`);
