// Builds docs/IRIS-What-Is-Built.pdf: every screen of a running IRIS, captured as each role sees it,
// with simple counts of how much is on each screen (for design review).
// Usage (both servers running): node scripts/build-inventory.mjs [baseUrl] [outPdf]
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:5180";
const OUT = resolve(process.argv[3] ?? "../docs/IRIS-What-Is-Built.pdf");
const WORK = join(tmpdir(), "iris-inventory");
mkdirSync(join(WORK, "img"), { recursive: true });

const ROLE = { "U-RESU-1": "RESU analyst", "U-PROV-MLY": "Provincial coordinator", "U-RHU-HIRAYA": "RHU staff", "U-ADMIN": "Administrator" };
const DESK = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const SLICE = { desk: 1640, phone: 1500 }; // px per PDF page
const MAX_SLICES = 4;
const git = (c) => { try { return execSync(`git ${c}`, { encoding: "utf8" }).trim(); } catch { return ""; } };
const BRANCH = git("rev-parse --abbrev-ref HEAD");
const COMMIT = git("rev-parse --short HEAD");
const DIRTY = git("status --porcelain") !== "";

// section, title, route, user, purpose, optional action (run before the capture), optional viewport
const SCREENS = [
  ["Dashboard", "Dashboard", "/", "U-RESU-1", "Landing page: what needs attention this week, the work queue and reporting status."],
  ["Dashboard", "Dashboard (RHU staff)", "/", "U-RHU-HIRAYA", "Same page as an RHU encoder sees it: their own reports and tasks."],

  ["Reports & Analysis", "Weekly reports: Reports", "/reports", "U-RESU-1", "Every expected weekly report, including ones not received; search, filter and inspect a record."],
  ["Reports & Analysis", "Weekly reports: Trends", "/reports?tab=trends", "U-RESU-1", "Small-multiple trends of the selected dataset."],
  ["Reports & Analysis", "Weekly reports: What's missing", "/reports?tab=quality", "U-RESU-1", "Data quality: blank vs zero vs not received, missing fields, duplicates."],
  ["Reports & Analysis", "Weekly reports: About this data", "/reports?tab=metadata", "U-RESU-1", "Dataset metadata and provenance."],
  ["Reports & Analysis", "Anomaly analysis", "/reports/analysis", "U-RESU-1", "Detection results on the simulated network and the evidence behind each flag."],
  ["Reports & Analysis", "Real dengue data: Zero reports", "/reports/dengue", "U-RESU-1", "Model B on real HDX/DOH dengue data: each week's zero reports ranked for checking."],
  ["Reports & Analysis", "Real dengue data: zero report detail", "/reports/dengue", "U-RESU-1", "Detail panel for one zero report, with the human review form.",
    async (p) => { await p.locator("tbody button").first().click(); await p.getByRole("dialog").waitFor(); }],
  ["Reports & Analysis", "Real dengue data: Low counts", "/reports/dengue?tab=flags", "U-RESU-1", "Model A flags: weeks where a place reported far fewer cases than expected."],
  ["Reports & Analysis", "Real dengue data: Weekly plan", "/reports/dengue?tab=plan", "U-RESU-1", "Model B v2: the checks to make each week within the staff-hour budget."],
  ["Reports & Analysis", "Real dengue data: How well it works", "/reports/dengue?tab=results", "U-RESU-1", "Test results for both models, real and synthetic kept apart, and project objectives."],
  ["Reports & Analysis", "Recovery", "/reports/recovery", "U-RESU-1", "Is reporting improving? Completeness and timeliness over time, before/after corrective actions."],

  ["Reporting Network", "Reporting network", "/network", "U-RESU-1", "How reporting units are connected (simulated network), with filters and a list view."],
  ["Reporting Network", "Reporting network: unit selected", "/network?unit=HUB-THM", "U-RESU-1", "The same graph with one hub's details open."],

  ["Investigations & Actions", "Investigation queue", "/investigations", "U-RESU-1", "All concerns raised by detection or by hand, with status and owner."],
  ["Investigations & Actions", "Investigation: Summary", "/investigations/C-0010", "U-RESU-1", "One concern: what happened, the evidence, what is uncertain, what to do next."],
  ["Investigations & Actions", "Investigation: Week by week", "/investigations/C-0010", "U-RESU-1", "The concern's week-by-week timeline.",
    async (p) => { await p.getByRole("tab", { name: "Week by week" }).click(); }],
  ["Investigations & Actions", "Plan actions", "/investigations/plan", "U-RESU-1", "Choose corrective actions within a staff-hour budget and compare plans."],
  ["Investigations & Actions", "Follow-up", "/investigations/follow-up", "U-RESU-1", "Corrective actions in progress, with evidence and outcomes."],
  ["Investigations & Actions", "Follow-up: action open", "/investigations/follow-up?assignment=F-0002", "U-RESU-1", "One follow-up action open for an update."],

  ["Data & Models", "Datasets", "/data", "U-RESU-1", "Datasets with provenance, validation status and limitations."],
  ["Data & Models", "Dataset detail", "/data/datasets/DS-DEMO-FACILITY", "U-RESU-1", "One dataset: coverage, data dictionary, lineage."],
  ["Data & Models", "Reporting units (admin)", "/data?tab=units", "U-ADMIN", "Reporting-unit metadata, editable by the administrator."],
  ["Data & Models", "System activity (admin)", "/data?tab=activity", "U-ADMIN", "Audit log of every action in the system."],
  ["Data & Models", "Import dataset", "/data/import", "U-RESU-1", "Upload a CSV, map columns, validate, declare provenance and import."],
  ["Data & Models", "Evaluation", "/data/evaluation", "U-RESU-1", "Synthetic evaluation of the detection methods."],

  ["Settings & Help", "Settings", "/settings", "U-RESU-1", "Demo role and display preferences."],
  ["Settings & Help", "Help", "/help", "U-RESU-1", "Glossary, status labels, method definitions and limitations."],

  ["On a phone", "Dashboard (RHU staff, phone)", "/", "U-RHU-HIRAYA", "The RHU encoder's dashboard at 390 px wide.", null, "phone"],
  ["On a phone", "Investigation (phone)", "/investigations/C-0010", "U-RESU-1", "A concern at 390 px wide.", null, "phone"],
  ["On a phone", "Real dengue data (phone)", "/reports/dengue", "U-RESU-1", "The real-data page at 390 px wide.", null, "phone"],
];

/** Height a drawer would need to show all of its content (its body scrolls inside a fixed panel). */
function dialogHeight() {
  const d = document.querySelector('[role="dialog"]');
  let h = d.scrollHeight;
  for (const e of d.querySelectorAll("*")) if (e.scrollHeight > e.clientHeight + 4) h = Math.max(h, d.clientHeight + e.scrollHeight - e.clientHeight);
  return h;
}

/** Counts of what is on the screen, inside the open dialog if there is one, else inside <main>. */
function measure(baseHeight) {
  const dialog = document.querySelector('[role="dialog"]');
  const root = dialog ?? document.querySelector("main");
  const vis = (el) => !!(el.offsetParent || el.getClientRects().length) && !el.closest(".sr-only");
  const all = (sel) => [...root.querySelectorAll(sel)].filter(vis);
  const charts = all("figure, .recharts-wrapper, canvas").filter((el) => !el.parentElement?.closest("figure, .recharts-wrapper"));
  return {
    screens: +((dialog ? dialogHeight() : document.documentElement.scrollHeight) / baseHeight).toFixed(1),
    words: (root.innerText.match(/\S+/g) ?? []).length,
    boxes: all(".iris-surface").length,
    charts: charts.length,
    tables: all("table").length,
    clickable: all("a[href], button, [role=button], summary").length,
    filters: all("select, input:not([type=hidden]), textarea").length,
    badges: all(".iris-badge").length,
  };
}

const browser = await chromium.launch();
const results = [];
for (const [i, [section, title, route, user, purpose, action, vp = "desk"]] of SCREENS.entries()) {
  const viewport = vp === "phone" ? PHONE : DESK;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: vp === "phone" ? 2 : 1.5 });
  await ctx.addInitScript((u) => localStorage.setItem("iris.demoUser", u), user);
  const p = await ctx.newPage();
  await p.goto(BASE + route);
  await p.waitForLoadState("networkidle");
  if (action) await action(p);
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(500);
  await p.evaluate(`window.dialogHeight = ${dialogHeight}`);
  const m = await p.evaluate(`(${measure})(${viewport.height})`);
  const dialog = await p.locator('[role="dialog"]').count();
  if (dialog) {
    // Grow the window until the whole drawer fits, so it can be captured in one go.
    const need = await p.evaluate(dialogHeight);
    await p.setViewportSize({ width: viewport.width, height: Math.min(need, SLICE[vp] * MAX_SLICES) });
    await p.waitForTimeout(300);
  }
  const height = dialog ? p.viewportSize().height : await p.evaluate(() => document.documentElement.scrollHeight);
  const slice = SLICE[vp];
  const n = Math.min(MAX_SLICES, Math.ceil(height / slice));
  const imgs = [];
  for (let s = 0; s < n; s++) {
    const file = join(WORK, "img", `${String(i).padStart(2, "0")}-${s}.jpg`);
    const h = Math.min(slice, height - s * slice);
    await p.screenshot({ path: file, type: "jpeg", quality: 82, fullPage: !dialog, clip: { x: 0, y: s * slice, width: viewport.width, height: h } });
    imgs.push(file);
  }
  results.push({ i, section, title, route, user, purpose, vp, m, imgs, cut: Math.ceil(height / slice) > MAX_SLICES, height });
  console.log(`${title}: ${m.screens} screens, ${m.clickable} clickable`);
  await ctx.close();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const desk = results.filter((r) => r.vp === "desk");
const ranked = [...desk].sort((a, b) => b.m.clickable + b.m.badges - (a.m.clickable + a.m.badges));
const sections = [...new Set(results.map((r) => r.section))];
const stamp = new Date().toLocaleString("en-GB", { timeZone: "Asia/Manila", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const metricCells = (m) => `<td>${m.screens}</td><td>${m.words}</td><td>${m.boxes}</td><td>${m.charts}</td><td>${m.tables}</td><td>${m.clickable}</td><td>${m.filters}</td><td>${m.badges}</td>`;
const HEAD = "<th>Screens tall</th><th>Words</th><th>Boxes</th><th>Charts</th><th>Tables</th><th>Clickable</th><th>Inputs</th><th>Badges</th>";

const html = `<!doctype html><html><head><meta charset="utf-8"><title>IRIS — What is built</title><style>
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { font: 10pt/1.45 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #0A3A4A; margin: 0; }
h1 { font-size: 26pt; margin: 0 0 4mm; } h2 { font-size: 15pt; margin: 0 0 2mm; } h3 { font-size: 12pt; margin: 0 0 1mm; }
p { margin: 0 0 2.5mm; } .muted { color: #4F6670; } .small { font-size: 8.5pt; }
.cover { height: 260mm; display: flex; flex-direction: column; justify-content: center; }
.eyebrow { font-size: 9pt; letter-spacing: .08em; text-transform: uppercase; color: #0E6680; font-weight: 600; margin-bottom: 3mm; }
.page { break-before: page; }
table { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
th, td { border-bottom: 1px solid #DCE4E6; padding: 1.4mm 1.6mm; text-align: right; vertical-align: top; }
th:first-child, td:first-child, th.l, td.l { text-align: left; }
thead th { color: #4F6670; font-weight: 600; background: #F3F7F7; }
.chip { display: inline-block; border: 1px solid #DCE4E6; border-radius: 3mm; padding: .3mm 2mm; font-size: 8pt; margin-right: 1mm; color: #0E6680; }
.metrics { display: grid; grid-template-columns: repeat(8, 1fr); gap: 1.5mm; margin: 2.5mm 0 3mm; }
.metrics div { border: 1px solid #DCE4E6; border-radius: 1.5mm; padding: 1.2mm 1.8mm; }
.metrics b { display: block; font-size: 12pt; } .metrics span { font-size: 7.5pt; color: #4F6670; }
.shot { border: 1px solid #DCE4E6; display: block; margin: 0 auto 2mm; }
.desk { width: 100%; } .phone { width: 44%; }
.cont { break-before: page; }
.label { font-size: 8pt; color: #4F6670; margin-bottom: 1mm; }
.sectionhead { break-before: page; height: 250mm; display: flex; flex-direction: column; justify-content: center; }
ul { margin: 0 0 3mm; padding-left: 5mm; } li { margin-bottom: 1mm; }
.bar { display: inline-block; height: 2.2mm; background: #0E6680; border-radius: .5mm; vertical-align: middle; }
</style></head><body>

<section class="cover">
  <div class="eyebrow">IRIS · Integrated Reporting Intervention System</div>
  <h1>What is built right now</h1>
  <p style="font-size:12pt;max-width:150mm">Every screen of the current prototype, as each role sees it, with a count of how much is on each one, to help decide where the design should be simplified.</p>
  <p class="muted small" style="margin-top:8mm">Captured ${esc(stamp)} (PHT) from branch <b>${esc(BRANCH)}</b>, commit ${esc(COMMIT)}${DIRTY ? " plus uncommitted changes" : ""}.<br>
  Desktop screens at ${DESK.width} × ${DESK.height} px; phone screens at ${PHONE.width} px. Demo data as it currently stands in the local database (not reset).<br>
  ${results.length} screens in ${sections.length} groups.</p>
</section>

<section class="page">
  <h2>How to read this document</h2>
  <p>Each screen has a short note on what it is for, the address, the role it was captured as, a row of counts, and the full screenshot. Long pages continue over several PDF pages${results.some((r) => r.cut) ? `; pages longer than ${MAX_SLICES} PDF pages are cut off and marked` : ""}.</p>
  <table style="margin:3mm 0 6mm"><tbody>
    <tr><td class="l"><b>Screens tall</b></td><td class="l">Page height divided by the window height (${DESK.height} px). 1.0 = fits without scrolling.</td></tr>
    <tr><td class="l"><b>Words</b></td><td class="l">Visible words in the page body (the top bar and footer are not counted).</td></tr>
    <tr><td class="l"><b>Boxes</b></td><td class="l">Card or panel containers.</td></tr>
    <tr><td class="l"><b>Charts</b></td><td class="l">Charts and graphs, including the network graph.</td></tr>
    <tr><td class="l"><b>Tables</b></td><td class="l">Visible tables (data-table toggles that are closed are not counted).</td></tr>
    <tr><td class="l"><b>Clickable</b></td><td class="l">Buttons, links, tabs and expanders the user can press.</td></tr>
    <tr><td class="l"><b>Inputs</b></td><td class="l">Drop-downs, text boxes and other form fields.</td></tr>
    <tr><td class="l"><b>Badges</b></td><td class="l">Small coloured status labels.</td></tr>
  </tbody></table>
  <p class="muted small">For a detail panel (drawer), the counts cover the panel only. The counts are a rough guide to how busy a screen is, not a quality score.</p>

  <h2 style="margin-top:6mm">Navigation</h2>
  <ul>${sections.filter((s) => s !== "On a phone").map((s) => `<li><b>${esc(s)}</b>: ${results.filter((r) => r.section === s).map((r) => esc(r.title.replace(/^[^:]+: /, ""))).filter((t, k, a) => a.indexOf(t) === k).join(" · ")}</li>`).join("")}</ul>
  <p class="small muted">Roles: RHU staff (report and respond), provincial coordinator and RESU analyst (review, plan, follow up), administrator (data and units). Real dengue data is open to coordinators, RESU analysts and administrators; only coordinators and analysts can record reviews.</p>
</section>

<section class="page">
  <h2>Busiest screens first</h2>
  <p class="muted small">Desktop screens sorted by clickable items plus badges: the things competing for attention. The bar shows that total.</p>
  <table><thead><tr><th class="l">Screen</th><th class="l"></th>${HEAD}</tr></thead><tbody>
  ${ranked.map((r) => { const t = r.m.clickable + r.m.badges; const max = ranked[0].m.clickable + ranked[0].m.badges; return `<tr><td class="l">${esc(r.title)}<div class="muted small">${esc(r.route)}</div></td><td class="l"><span class="bar" style="width:${(t / max) * 22}mm"></span></td>${metricCells(r.m)}</tr>`; }).join("")}
  </tbody></table>
</section>

${sections.map((s) => `
<section class="sectionhead"><div class="eyebrow">Section</div><h1>${esc(s)}</h1>
  <ul>${results.filter((r) => r.section === s).map((r) => `<li>${esc(r.title)} <span class="muted small">${esc(r.route)}</span></li>`).join("")}</ul></section>
${results.filter((r) => r.section === s).map((r) => `
<section class="page">
  <h2>${esc(r.title)}</h2>
  <p>${esc(r.purpose)}</p>
  <p><span class="chip">${esc(r.route)}</span><span class="chip">${esc(ROLE[r.user])}</span><span class="chip">${r.vp === "phone" ? `Phone ${PHONE.width} px` : `Desktop ${DESK.width} px`}</span></p>
  <div class="metrics">${[["Screens tall", r.m.screens], ["Words", r.m.words], ["Boxes", r.m.boxes], ["Charts", r.m.charts], ["Tables", r.m.tables], ["Clickable", r.m.clickable], ["Inputs", r.m.filters], ["Badges", r.m.badges]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join("")}</div>
  ${r.imgs.map((img, k) => `${k ? `<div class="cont"><div class="label">${esc(r.title)} — continued (${k + 1} of ${r.imgs.length})</div>` : "<div>"}<img class="shot ${r.vp}" src="${pathToFileURL(img)}"></div>`).join("")}
  ${r.cut ? `<p class="muted small">Cut off here: the page is ${(r.height / (r.vp === "phone" ? PHONE.height : DESK.height)).toFixed(1)} screens tall.</p>` : ""}
</section>`).join("")}`).join("")}
</body></html>`;

const htmlPath = join(WORK, "inventory.html");
writeFileSync(htmlPath, html);
const pdfPage = await (await browser.newContext()).newPage();
await pdfPage.goto(pathToFileURL(htmlPath).href);
await pdfPage.waitForLoadState("load");
await pdfPage.pdf({ path: OUT, format: "A4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
  displayHeaderFooter: true, headerTemplate: "<span></span>",
  footerTemplate: '<div style="font-size:7pt;color:#4F6670;width:100%;padding:0 12mm;display:flex;justify-content:space-between"><span>IRIS · What is built</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
await browser.close();
console.log("wrote", OUT);
