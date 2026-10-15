// Responsive QA: loads every route at each target width as several demo roles and
// fails if the page scrolls horizontally, logs console errors, or shows an error state.
// Usage: node scripts/check-responsive.mjs [baseUrl] [screenshotDir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:5180";
const SHOTS = process.argv[3] ?? null;
const WIDTHS = [320, 375, 768, 1024, 1440];
const PLAN = {
  "U-RESU-1": ["/", "/investigations", "/investigations/C-0008", "/investigations/C-0012", "/network", "/network?unit=HUB-THM", "/data", "/data?tab=trends",
    "/data/import", "/planner", "/follow-up", "/follow-up?assignment=F-0002", "/recovery", "/evaluation", "/data-management", "/data-management/DS-DEMO-FACILITY", "/settings", "/help"],
  "U-RHU-HIRAYA": ["/", "/investigations/C-0014", "/data", "/follow-up"],
  "U-PROV-MLY": ["/", "/planner?concern=C-0010", "/investigations/C-0010"],
  "U-ADMIN": ["/data-management?tab=units", "/data-management?tab=activity", "/network"],
};

if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch();
const failures = [];
let checks = 0;
for (const [user, routes] of Object.entries(PLAN)) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript((u) => window.localStorage.setItem("iris.demoUser", u), user);
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
    for (const route of routes) {
      checks++;
      errors.length = 0;
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, iw: window.innerWidth,
        alerts: [...document.querySelectorAll('[role="alert"]')].map((a) => a.textContent?.slice(0, 160)),
        h1: document.querySelector("h1")?.textContent ?? null,
        loading: !!document.querySelector('[role="status"] .animate-spin'),
      }));
      const problems = [];
      if (r.sw > r.iw + 1) problems.push(`horizontal overflow ${r.sw}px > ${r.iw}px`);
      if (r.alerts.length) problems.push(`error state: ${r.alerts.join(" | ")}`);
      if (!r.h1) problems.push("no page heading");
      if (r.loading) problems.push("still loading");
      if (errors.length) problems.push(`console: ${errors.slice(0, 3).join(" | ")}`);
      if (problems.length) failures.push(`${user} ${width}px ${route}: ${problems.join("; ")}`);
      if (SHOTS && (width === 375 || width === 1440)) {
        const name = `${user}_${width}_${route.replace(/[^a-z0-9]+/gi, "_") || "root"}.png`;
        await page.screenshot({ path: `${SHOTS}/${name}`, fullPage: true });
      }
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`${checks} page checks across widths ${WIDTHS.join(", ")}px.`);
if (failures.length) {
  console.log(`${failures.length} problem(s):\n` + failures.join("\n"));
  process.exit(1);
}
console.log("No horizontal overflow, error states or console errors.");
