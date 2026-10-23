// End-to-end workflow check against a running IRIS (frontend + backend).
// Resets the demo data first. Usage: node scripts/e2e-workflow.mjs [baseUrl]
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:5180";
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(`PASS ${name}`); }
  catch (e) { results.push(`FAIL ${name}: ${String(e.message ?? e).split("\n")[0]}`); }
}

const browser = await chromium.launch();
async function as(user, width = 1440) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript((u) => localStorage.setItem("iris.demoUser", u), user);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => results.push(`PAGE ERROR (${user}): ${e}`));
  return page;
}

let page = await as("U-RESU-1");
await page.request.post(`${BASE}/api/demo/reset`, { data: { confirm: "RESET" }, headers: { "X-IRIS-User": "U-ADMIN" } });

await step("concern: start review, confirm with reason, assign, note, resolve", async () => {
  await page.goto(`${BASE}/investigations/C-0019`);
  await page.getByRole("button", { name: "Start review" }).click();
  await expect(page.getByText("Being reviewed").first()).toBeVisible();
  await page.getByRole("button", { name: "Confirm it's a real problem" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/at least 10 characters/)).toBeVisible();
  await page.getByRole("dialog").getByRole("textbox").fill("Called the RHU; reports were not transmitted.");
  await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Being fixed").first()).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Assign an owner" }).click();
  await page.getByRole("dialog").getByRole("combobox").first().selectOption("U-RESU-2");
  await page.getByRole("dialog").getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText(/Owner: RESU Epidemiologist/)).toBeVisible();
  await page.getByRole("tab", { name: /Notes & history/ }).click();
  await page.getByLabel("Add a note").fill("Encoder returns tomorrow; will re-send.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Encoder returns tomorrow; will re-send.")).toBeVisible();
  // Resolving needs evidence a person attached; until then the action is not offered.
  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("button", { name: "Mark as resolved" })).toHaveCount(0);
  await page.getByRole("button", { name: "Attach evidence" }).click();
  await page.getByRole("dialog").getByLabel("Title").fill("Backlog received");
  await page.getByRole("dialog").getByLabel("What it shows").fill("The two missing weekly reports arrived after the call.");
  await page.getByRole("dialog").getByRole("button", { name: "Attach evidence" }).click();
  await expect(page.getByText("Backlog received").first()).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Mark as resolved" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Backlog received after the encoder returned.");
  await page.getByRole("dialog").getByRole("button", { name: "Mark resolved" }).click();
  await expect(page.getByText(/This concern is resolved/)).toBeVisible();
  await expect(page.getByText(/recorded a resolution for C-0019/)).toBeVisible();
});

await step("dismissal requires a reason and is recorded", async () => {
  await page.goto(`${BASE}/investigations/C-0020`);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Close as not a problem" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close concern" }).click();
  await expect(page.getByRole("dialog").getByText(/at least 10 characters/)).toBeVisible();
  await page.getByRole("dialog").getByRole("textbox").fill("Report was sent by courier and arrived after review.");
  await page.getByRole("dialog").getByRole("button", { name: "Close concern" }).click();
  await expect(page.getByText("Not a problem").first()).toBeVisible();
  await page.getByRole("tab", { name: "More details" }).click();
  await expect(page.getByText("Report was sent by courier and arrived after review.")).toBeVisible();
});

await step("home: status chips filter the list", async () => {
  await page.goto(`${BASE}/`);
  const items = page.locator('ul[aria-label="Work queue"] > li');
  await items.first().waitFor();
  const before = await items.count();
  await page.getByRole("button", { name: /^New/ }).click();
  await expect.poll(async () => items.count()).toBeLessThan(before);
  await page.getByRole("button", { name: /^All open/ }).click();
  await expect.poll(async () => items.count()).toBe(before);
});

let assignmentId;
await step("planner: budget changes selection; save, approve; follow-up created", async () => {
  await page.goto(`${BASE}/planner`);
  const budget = page.getByLabel("Staff-hours available");
  const sentence = page.locator("p").filter({ hasText: "This is expected to bring back" });
  const benefit = async () => parseFloat((await sentence.locator("strong").nth(2).textContent())?.replace(/[^0-9.]/g, "") ?? "0");
  await budget.fill("4");
  await expect(sentence).toContainText("of 4 hours");
  const small = await benefit();
  await budget.fill("60");
  await expect(sentence).toContainText("of 60 hours");
  const large = await benefit();
  if (!(large > small)) throw new Error(`benefit did not grow with budget (${small} → ${large})`);
  await page.getByRole("button", { name: "Save this plan" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("button", { name: "Approve plan" })).toBeVisible();
  await page.getByRole("button", { name: "Approve plan" }).click();
  await expect(page.getByText(/follow-up action\(s\) created/)).toBeVisible();
  assignmentId = await page.locator('a[href^="/follow-up?assignment="]').first().textContent();
});

await step("follow-up: progress, completion evidence, outcome, close", async () => {
  await page.goto(`${BASE}/follow-up?assignment=${assignmentId}`);
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Start", exact: true }).click();
  await expect(sheet.getByText("In progress").first()).toBeVisible();
  await sheet.getByRole("button", { name: "Mark as done" }).click();
  await expect(sheet.getByText(/Describe the evidence of completion/)).toBeVisible();
  await sheet.getByLabel("What was done?").fill("Call log recorded (demo).");
  await sheet.getByRole("button", { name: "Mark as done" }).click();
  await sheet.getByLabel("Result").selectOption("not_yet_verified");
  await sheet.getByLabel("What did you see afterwards?").fill("Waiting for next week's reports to verify.");
  await sheet.getByRole("button", { name: "Save result" }).click();
  await expect(sheet.getByText("Not checked yet").first()).toBeVisible();
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(sheet.getByText("Closed").first()).toBeVisible();
});

await step("network: list view and node details", async () => {
  await page.goto(`${BASE}/network`);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: "Tahimik Provincial Reporting Hub" }).click();
  await expect(page.getByText("Units reporting through it")).toBeVisible();
  await expect(page.getByText(/aggregates the units that report through the hub/)).toBeVisible();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Province").selectOption("Malaya");
  await expect(page.getByRole("button", { name: "Masagana Provincial Hospital" })).toHaveCount(0);
});

await step("evaluation: run an experiment from the UI", async () => {
  await page.goto(`${BASE}/evaluation`);
  await page.getByLabel("Number of runs").fill("3");
  await page.getByRole("button", { name: "Run test" }).click();
  await expect(page.getByText(/finished in/)).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Tested on 3 simulated runs/)).toBeVisible();
});

const dir = mkdtempSync(join(tmpdir(), "iris-e2e-"));
const bad = join(dir, "bad.csv"), good = join(dir, "good.csv");
writeFileSync(bad, "week_start,cases\n2026-05-04,12\nnot-a-date,3\n2026-05-18,-1\n");
writeFileSync(good, "week_start,disease,province,cases\n2026-05-04,Dengue,Masagana,12\n2026-05-11,Dengue,Masagana,\n2026-05-18,Dengue,Masagana,0\n");
page = await as("U-ADMIN");
await step("CSV import: row-level errors block import", async () => {
  await page.goto(`${BASE}/data/import`);
  await page.getByLabel("CSV file").setInputFiles(bad);
  await page.getByRole("button", { name: "Upload and preview" }).click();
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByText(/problem\(s\) must be fixed/)).toBeVisible();
  await expect(page.getByText(/Could not read ‘not-a-date’/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel import" }).click();
});
await step("CSV import: valid file with provenance is imported", async () => {
  await page.getByLabel("CSV file").setInputFiles(good);
  await page.getByRole("button", { name: "Upload and preview" }).click();
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByText(/passed validation/)).toBeVisible();
  await expect(page.getByText("1 reported · 1 zero · 1 blank")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Review and import" }).click();
  await expect(page.getByText(/Declare whether the data is real/)).toBeVisible();
  await page.getByLabel("Source").fill("Hand-made test file");
  await page.getByLabel("Geographic level").selectOption("province");
  await page.getByLabel(/Synthetic \/ simulated/).check();
  await page.getByRole("button", { name: "Review and import" }).click();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByText("No reporting schedule (expected submissions) is defined: completeness cannot be calculated.")).toBeVisible();
});

page = await as("U-RHU-HIRAYA", 375);
await step("RHU (mobile): submit a missing report and respond to clarification", async () => {
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: "Submit report" }).first().waitFor();
  const n = await page.getByRole("button", { name: "Submit report" }).count();
  await page.getByRole("button", { name: "Submit report" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText(/Enter a count, or tick/)).toBeVisible();
  await page.getByLabel("Number of cases").fill("4");
  await page.getByRole("dialog").getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText(/recorded as late/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit report" })).toHaveCount(n - 1);
  await page.getByRole("link", { name: "Reply", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("textbox").fill("Encoder was on leave; reports will be sent this week.");
  await page.getByRole("dialog").getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("Reply sent.")).toBeVisible();
});
await step("mobile navigation drawer", async () => {
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Data", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Data" })).toBeVisible();
});

await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => !r.startsWith("PASS")) ? 1 : 0);
