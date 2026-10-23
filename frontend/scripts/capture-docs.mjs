// Captures the screenshots used in docs/USER_GUIDE.md from a running IRIS.
// Resets the demo data first so every image shows the same seeded state.
// Usage: node scripts/capture-docs.mjs [baseUrl] [outDir]
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:5180";
const OUT = process.argv[3] ?? "../docs/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const req = await (await browser.newContext()).request;
await req.post(`${BASE}/api/demo/reset`, { data: {}, headers: { "X-IRIS-User": "U-ADMIN" } });

async function open(user, width = 1440, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 600 ? 2 : 1 });
  await ctx.addInitScript((u) => localStorage.setItem("iris.demoUser", u), user);
  return ctx.newPage();
}
async function shot(page, name, maxHeight = 1500) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vw = page.viewportSize().width;
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true, clip: { x: 0, y: 0, width: vw, height: Math.min(h, maxHeight) } });
  console.log("saved", name);
}

let p = await open("U-RESU-1");
await p.goto(`${BASE}/`); await shot(p, "01-home");
await p.goto(`${BASE}/investigations`); await shot(p, "02-concerns");
await p.goto(`${BASE}/investigations/C-0010`); await shot(p, "03-concern-summary", 1200);
await p.goto(`${BASE}/investigations/C-0008`);
await p.getByRole("tab", { name: "Week by week" }).click(); await shot(p, "04-concern-week-by-week", 900);
await p.goto(`${BASE}/investigations/C-0016`);
await p.getByRole("button", { name: "More actions" }).click(); await shot(p, "05-concern-actions", 700);
await p.goto(`${BASE}/planner`); await p.getByText("This is expected to bring back").waitFor(); await shot(p, "06-plan-actions", 1250);
await p.goto(`${BASE}/follow-up?assignment=F-0004`); await shot(p, "07-track-actions", 1100);
await p.goto(`${BASE}/network?unit=HUB-THM`); await shot(p, "08-network", 1300);
await p.goto(`${BASE}/recovery`); await shot(p, "09-recovery", 1400);
await p.goto(`${BASE}/data`); await shot(p, "10-data-reports", 1200);
await p.goto(`${BASE}/data?tab=quality`); await p.getByRole("tab", { name: "What's missing" }).click(); await shot(p, "11-data-missing", 1200);
await p.goto(`${BASE}/evaluation`); await p.getByText("What this test shows").waitFor(); await shot(p, "12-model-evaluation", 1300);
await p.goto(`${BASE}/data-management`); await shot(p, "13-data-sources", 900);

const dir = mkdtempSync(join(tmpdir(), "iris-docs-"));
const csv = join(dir, "dengue_weekly.csv");
writeFileSync(csv, "week_start,disease,province,cases\n2026-05-04,Dengue,Masagana,12\n2026-05-11,Dengue,Masagana,\n2026-05-18,Dengue,Masagana,0\n2026-05-25,Dengue,Masagana,9\n");
p = await open("U-ADMIN");
await p.goto(`${BASE}/data/import`);
await p.getByLabel("CSV file").setInputFiles(csv);
await p.getByRole("button", { name: "Upload and preview" }).click();
await p.getByRole("button", { name: "Validate" }).waitFor(); await shot(p, "14-import-mapping", 1300);
await p.getByRole("button", { name: "Validate" }).click();
await p.getByText(/passed validation/).waitFor(); await shot(p, "15-import-validation", 1000);
await p.getByRole("button", { name: "Cancel import" }).click();

p = await open("U-RHU-HIRAYA", 390, 844);
await p.goto(`${BASE}/`); await shot(p, "16-mobile-rhu-home", 1600);
await p.goto(`${BASE}/investigations/C-0014`); await shot(p, "17-mobile-concern", 1300);
await p.getByRole("button", { name: "Open navigation menu" }).click(); await p.waitForTimeout(300); await shot(p, "18-mobile-menu", 844);

await browser.close();
