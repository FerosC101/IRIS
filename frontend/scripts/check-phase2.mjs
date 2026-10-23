// Real API verification. Live mode permits GET requests only. --isolated starts
// the existing FastAPI application against a new temporary SQLite database and
// proxies browser API traffic there. No reset endpoint is allowed in either mode.
// Usage: IRIS_BROWSER_CHANNEL=msedge node scripts/check-phase2.mjs [--isolated]
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.IRIS_FRONTEND_URL ?? "http://localhost:5180";
const isolated = process.argv.includes("--isolated");
const shots = join(frontend, "qa-screenshots", "phase2", isolated ? "isolated" : "live");
mkdirSync(shots, { recursive: true });
const results = [];
const forbidden = [];
let backend;
let browser;
let target;
let database;

async function startIsolatedBackend() {
  database = join(mkdtempSync(join(tmpdir(), "iris-phase2-")), "browser-test.db");
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  target = `http://127.0.0.1:${port}`;
  const python = join(frontend, "..", "backend", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  backend = spawn(python, ["-m", "uvicorn", "iris.main:app", "--host", "127.0.0.1", "--port", String(port), "--log-level", "warning"], {
    cwd: join(frontend, "..", "backend"), windowsHide: true,
    env: { ...process.env, IRIS_DB_PATH: database, IRIS_DATABASE_URL: `sqlite:///${database.replaceAll("\\", "/")}`, PYTHONDONTWRITEBYTECODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  backend.stdout.on("data", (chunk) => { logs += chunk; });
  backend.stderr.on("data", (chunk) => { logs += chunk; });
  backend.on("error", (error) => { logs += error.message; });
  for (let attempt = 0; attempt < 90; attempt++) {
    if (backend.exitCode !== null) throw new Error(`Isolated backend exited: ${logs}`);
    try { if ((await fetch(target + "/api/health")).ok) { console.log(`Isolated API: ${target}; disposable database: ${database}`); return; } } catch { /* wait for normal startup/initial seeding */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Isolated backend did not start: ${logs}`);
}

// Attach a rejection handler immediately so an action/locator failure cannot
// turn its pending response waiter into an unhandled rejection.
function nextResponse(page, predicate) {
  const pending = page.waitForResponse(predicate);
  pending.catch(() => {});
  return pending;
}

process.on("exit", () => { if (backend && backend.exitCode === null) backend.kill(); });

function pass(message) { results.push({ status: "PASS", message }); console.log(`PASS ${message}`); }

async function contextFor(user) {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.addInitScript((id) => localStorage.setItem("iris.demoUser", id), user);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/demo/reset" || (!isolated && request.method() !== "GET")) {
      forbidden.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    if (!isolated) return route.continue();
    const response = await route.fetch({ url: target + url.pathname + url.search });
    return route.fulfill({ response });
  });
  return context;
}

async function capture(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(shots, name), fullPage: true });
}

async function renderCheck(page, path, width, name) {
  const errors = [];
  const onError = (error) => errors.push(error.message);
  const onConsole = (message) => { if (message.type() === "error") errors.push(message.text()); };
  const onResponse = (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); };
  page.on("pageerror", onError); page.on("console", onConsole); page.on("response", onResponse);
  try {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + path, { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily.replaceAll('"', ""))).toBe("Poppins, sans-serif");
    expect(await page.evaluate(() => [400, 500, 600, 700].every((weight) => document.fonts.check(`${weight} 16px Poppins`)))).toBe(true);
    expect(await page.evaluate(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
    expect(errors).toEqual([]);
    await capture(page, `${name}-${width}.png`);
    pass(`${name} ${width}px renders without overflow/errors; fonts and images loaded`);
  } finally {
    page.off("pageerror", onError); page.off("console", onConsole); page.off("response", onResponse);
  }
}

async function upload(page, name, contents) {
  await page.goto(base + "/data/import", { waitUntil: "networkidle" });
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(contents) });
  const response = nextResponse(page, (response) => response.url().includes("/api/imports/preview") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Upload and preview", exact: true }).click();
  const preview = await (await response).json();
  await expect(page.getByRole("heading", { name: "2. Map columns", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: /^Reporting period start date/ }).selectOption("period_start");
  await page.getByRole("combobox", { name: /^Reported value/ }).selectOption("value");
  return preview;
}

async function validate(page) {
  const response = nextResponse(page, (response) => response.url().includes("/api/imports/validate") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  const result = await (await response).json();
  await expect(page.getByRole("heading", { name: "Validation findings", exact: true })).toBeVisible();
  return result;
}

async function safeReadChecks() {
  const context = await contextFor("U-RESU-1");
  const page = await context.newPage();
  for (const width of [1600, 1440, 1024, 768, 375, 320]) {
    for (const [path, name] of [["/", "overview"], ["/data-management", "datasets"], ["/data-management/DS-DEMO-FACILITY", "dataset-detail"], ["/data/import", "import-upload"]]) await renderCheck(page, path, width, name);
    await page.goto(base, { waitUntil: "networkidle" });
    expect(await page.locator("main header").first().locator("button,input,select").count()).toBe(0);
    const hero = await page.locator(".iris-overview-hero").boundingBox();
    const metric = await page.locator(".iris-metric").first().boundingBox();
    expect(hero.height).toBeGreaterThan(metric.height + 20);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base, { waitUntil: "networkidle" });
  const periodResponse = nextResponse(page, (response) => response.url().includes("/api/overview?") && response.url().includes("period=latest"));
  await page.getByRole("combobox", { name: "Queue reporting period" }).selectOption("latest");
  expect((await periodResponse).ok()).toBe(true);
  const filterResponse = nextResponse(page, (response) => response.url().includes("/api/overview?") && response.url().includes("status=open"));
  await page.getByRole("button", { name: /^New\b/ }).click();
  expect((await filterResponse).ok()).toBe(true);
  await page.getByRole("button", { name: "Show data table", exact: true }).click();
  await expect(page.locator("figure").getByRole("table")).toBeVisible();
  pass("Overview queue period/status trigger real reads; reporting chart has a table alternative");
  await page.goto(base + "/data-management", { waitUntil: "networkidle" });
  await page.getByRole("searchbox", { name: "Search datasets" }).fill("no-matching-dataset-phase2");
  await expect(page.getByText("No datasets match", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).first().click();
  await page.getByRole("combobox", { name: "Data classification" }).selectOption("synthetic");
  await expect(page.getByRole("heading", { name: "Dataset registry" })).toBeVisible();
  const previews = page.getByRole("button", { name: /^Preview / });
  if (await previews.count() > 1) { await previews.nth(1).click(); await expect(previews.nth(1)).toHaveAttribute("aria-pressed", "true"); }
  await page.getByRole("link", { name: "Inspect dataset", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Provenance and metadata", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Explore data", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Data", exact: true })).toBeVisible();
  pass("Dataset search/classification/preview/detail and Data Explorer navigation work");
  await context.close();
  for (const [user, paths] of [
    ["U-ADMIN", [["/data-management?tab=imports", "admin-import-history"], ["/data-management?tab=units", "admin-units"], ["/data-management?tab=activity", "admin-audit"]]],
    ["U-RHU-HIRAYA", [["/", "rhu-overview"], ["/data", "rhu-data"], ["/data/import", "rhu-import-permission"]]],
    ["U-PROV-MLY", [["/", "coordinator-overview"], ["/data", "coordinator-data"]]],
  ]) {
    const roleContext = await contextFor(user); const rolePage = await roleContext.newPage();
    for (const [path, name] of paths) await renderCheck(rolePage, path, 375, name);
    if (user === "U-RHU-HIRAYA") {
      await rolePage.goto(base, { waitUntil: "networkidle" });
      await expect(rolePage.getByRole("heading", { name: /^Your to-do list/ })).toBeVisible();
      const submit = rolePage.getByRole("button", { name: "Submit report", exact: true }).first();
      if (await submit.count()) { await submit.click(); await expect(rolePage.getByRole("dialog")).toBeVisible(); await rolePage.getByRole("button", { name: "Cancel", exact: true }).click(); }
      pass("RHU tasks and report dialog remain accessible without submitting");
    }
    await roleContext.close();
  }
}

async function isolatedImportChecks() {
  const context = await contextFor("U-ADMIN"); const page = await context.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await upload(page, "phase2-invalid.csv", "period_start,value,category,area\nnot-a-date,-2,DENGUE,Phase2 test\n2026-05-11,0,DENGUE,Phase2 test\n");
  const invalid = await validate(page);
  expect(invalid.can_accept).toBe(false);
  await expect(page.locator(".iris-validation-metrics .iris-metric").nth(0).locator("dd")).toHaveText("\u2014");
  await expect(page.locator(".iris-validation-metrics .iris-metric").nth(2).locator("dd")).toHaveText("1");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await capture(page, "validation-invalid-1600.png");
  await page.setViewportSize({ width: 320, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capture(page, "validation-invalid-320.png");
  pass("Invalid date + count on one source row show one rejected record; import remains blocked");
  await page.getByRole("button", { name: "Back to mapping", exact: true }).click();
  await page.getByRole("combobox", { name: /^Reported value/ }).selectOption("");
  await validate(page);
  await expect(page.locator(".iris-validation-metrics .iris-metric").nth(2).locator("dd")).toHaveText("\u2014");
  pass("Missing required mapping shows file-level issues without an invented rejected-row count");
  const cancelResponse = nextResponse(page, (response) => response.request().method() === "DELETE" && response.url().includes("/api/imports/"));
  await page.getByRole("button", { name: "Cancel import", exact: true }).click();
  expect((await cancelResponse).ok()).toBe(true);
  await expect(page.getByLabel("CSV file", { exact: true })).toHaveValue("");
  pass("Cancel releases the real staged import token and returns to upload");
  await upload(page, "phase2-duplicates.csv", "period_start,value,category,area\n2026-05-04,4,DENGUE,Phase2 test\n2026-05-04,8,DENGUE,Phase2 test\n2026-05-11,0,DENGUE,Phase2 test\n");
  const duplicate = await validate(page); expect(duplicate.can_accept).toBe(false);
  const duplicateResponse = nextResponse(page, (response) => response.url().includes("/api/imports/validate") && response.request().method() === "POST");
  await page.getByRole("checkbox", { name: /^Keep only the last occurrence of duplicate rows/ }).check();
  const deduplicated = await (await duplicateResponse).json(); expect(deduplicated.can_accept).toBe(true);
  await expect(page.locator(".iris-validation-metrics .iris-metric").nth(0).locator("dd")).toHaveText("2");
  await capture(page, "validation-duplicates-320.png");
  await page.getByRole("button", { name: "Cancel import", exact: true }).click();
  pass("Duplicate policy revalidates against the backend and reports the post-deduplication count");
  const expired = await upload(page, "phase2-expired.csv", "period_start,value\n2026-05-04,1\n");
  await page.evaluate((token) => fetch(`/api/imports/${token}`, { method: "DELETE" }), expired.token);
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(page.getByText("This upload expired (the server may have restarted). Please start again.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start again", exact: true }).click();
  pass("Real expired-token response offers recovery without committing data");
  await page.setViewportSize({ width: 1600, height: 1000 });
  const validFile = "period_start,value,category,area,due_at,received_at\n2026-05-04,12,DENGUE,Phase2 test,2026-05-06,2026-05-07\n2026-05-11,0,DENGUE,Phase2 test,2026-05-13,2026-05-10\n2026-05-18,,DENGUE,Phase2 test,2026-05-20,2026-05-20\n";
  await upload(page, "phase2-semantics.csv", validFile);
  for (const width of [1600, 1440, 1024, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await capture(page, `import-mapping-${width}.png`);
  }
  // Hold one real validation request to inspect the pending controls without
  // substituting a response. The request then continues to the isolated API.
  let releaseValidation;
  const validationGate = new Promise((resolve) => { releaseValidation = resolve; });
  const holdValidation = async (route) => { await validationGate; await route.fallback(); };
  await context.route("**/api/imports/validate", holdValidation);
  const validResponse = nextResponse(page, (response) => response.url().includes("/api/imports/validate") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(page.getByRole("button", { name: "Validating...", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel import", exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: /^Reported value/ })).toBeDisabled();
  releaseValidation();
  const valid = await (await validResponse).json();
  await context.unroute("**/api/imports/validate", holdValidation);
  await expect(page.getByRole("heading", { name: "Validation findings", exact: true })).toBeVisible();
  expect(valid.can_accept).toBe(true); expect(valid.warnings.length).toBeGreaterThan(0);
  pass("Validation pending state prevents duplicate submission, cancellation, and mapping edits");
  expect(valid.summary.value_status).toEqual({ reported: 1, zero: 1, blank: 1 });
  for (const width of [1600, 1440, 1024, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.locator('.iris-validation-metrics .iris-surface-metric').count()).toBe(3);
    await capture(page, `validation-valid-${width}.png`);
  }
  pass("Mapping and valid-with-warning findings render at all six widths; blank/zero/reported remain distinct");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Review and import", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Describe where the data came from.", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Dataset name", exact: true }).fill("Phase 2 isolated semantics check");
  await page.getByRole("combobox", { name: "Geographic level", exact: true }).selectOption("province");
  await page.getByRole("textbox", { name: "Source", exact: true }).fill("Synthetic CSV generated by the isolated browser verification script");
  await page.getByRole("radio", { name: /Synthetic \/ simulated/ }).check();
  await capture(page, "import-provenance-320.png");
  await page.getByRole("button", { name: "Review and import", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Import this dataset?" })).toBeVisible();
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await page.getByRole("button", { name: "Review and import", exact: true }).click();
  const commitResponse = nextResponse(page, (response) => response.url().includes("/api/imports/commit") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Confirm import", exact: true }).click();
  const response = await commitResponse; expect(response.ok()).toBe(true); const dataset = await response.json();
  await expect(page.getByRole("heading", { name: dataset.name, exact: true })).toBeVisible();
  await capture(page, "import-result-320.png");
  await page.getByRole("link", { name: "Explore data", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Reports", exact: true })).toBeVisible();
  const records = await page.evaluate(async (id) => (await fetch(`/api/datasets/${id}/records?page_size=25`, { headers: { "X-IRIS-User": "U-ADMIN" } })).json(), dataset.id);
  expect(records.rows.some((row) => row.value === 0 && row.value_status === "zero")).toBe(true);
  expect(records.rows.some((row) => row.value === null && row.value_status === "blank")).toBe(true);
  expect(records.rows.some((row) => row.status === "late")).toBe(true);
  pass("Required provenance, review/back, confirmation, dataset result, explorer, and stored zero/blank/late semantics verified in disposable DB");
  await context.close();
}

try {
  if (isolated) await startIsolatedBackend();
  browser = await chromium.launch({ channel: process.env.IRIS_BROWSER_CHANNEL || undefined });
  if (!isolated) await safeReadChecks();
  else await isolatedImportChecks();
  expect(forbidden).toEqual([]);
  console.log(`${results.length} check groups passed. Screenshots: ${shots}`);
} catch (error) {
  results.push({ status: "FAIL", message: error.stack ?? String(error) });
  console.error(error); process.exitCode = 1;
} finally {
  await browser?.close();
  if (backend && backend.exitCode === null) backend.kill();
  writeFileSync(join(shots, "results.json"), JSON.stringify({ isolated, database, target, forbidden, results }, null, 2));
}
