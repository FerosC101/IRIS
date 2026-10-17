import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const output = resolve("qa-screenshots/phase4/references");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
 const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
 for (const name of ["10_InterventionPlanner", "11_RecoveryAssessment", "12_EvaluationLab"]) {
  await page.goto(pathToFileURL(resolve(`../design-reference/IRIS_Editable_Latest/IRIS_${name}.html`)).href);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  console.log(name + ": " + (await page.locator("main").innerText()).slice(0, 4500));
 }
} finally { await browser.close(); }
