// Real API verification. Live mode permits GET requests only. --isolated starts
// the existing FastAPI application against a new temporary SQLite database and
// proxies browser API traffic there. No reset endpoint is allowed in either mode.
// Usage: node scripts/check-phase4.mjs --isolated [--workflows-only]
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
const shots = join(frontend, "qa-screenshots", "phase4", isolated ? "isolated" : "live");
mkdirSync(shots, { recursive: true });
const results = [];
const forbidden = [];
let backend;
let browser;
let target;
let database;

async function startIsolatedBackend() {
  database = join(mkdtempSync(join(tmpdir(), "iris-phase4-")), "browser-test.db");
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
    try {
      const response = await route.fetch({ url: target + url.pathname + url.search, maxRetries: 2 });
      return await route.fulfill({ response });
    } catch (error) {
      // Navigation/HMR may cancel an in-flight read; never leave an unhandled rejection.
      if (!request.failure()) console.error(`Proxy request failed: ${request.method()} ${url.pathname}: ${error.message}`);
      await route.abort().catch(() => {});
    }
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
    if (width === 1600) await page.screenshot({ path: join(shots, `${name}-1600x1000.png`) });
    pass(`${name} ${width}px renders without overflow/errors; fonts and images loaded`);
  } finally {
    page.off("pageerror", onError); page.off("console", onConsole); page.off("response", onResponse);
  }
}



try {
  if (!isolated) throw new Error("Phase 4 workflow verification requires --isolated");
  await startIsolatedBackend();
  browser = await chromium.launch({ channel: process.env.IRIS_BROWSER_CHANNEL || "msedge", headless: true });
  const ctx = await contextFor("U-RESU-1");
  const page = await ctx.newPage(); page.setDefaultTimeout(20000);
  const posts = [];
  page.on("request", (r) => { if (r.url().includes("/api/") && r.method() !== "GET") posts.push(r); });
  if (!process.argv.includes("--workflows-only")) for (const width of [1600, 1440, 1024, 768, 375, 320]) {
    for (const [path, name] of [["/planner", "planner"], ["/recovery", "recovery"], ["/evaluation", "evaluation"]]) await renderCheck(page, path, width, name);
  }
  expect(posts.length).toBe(0); pass("No automatic optimization, save, decision or experiment POST on navigation");
  if (!process.argv.includes("--workflows-only")) for (const path of ["/", "/data-management", "/data-management/DS-DEMO-FACILITY", "/data/import", "/network", "/anomalies", "/investigations", "/investigations/C-0012", "/follow-up"]) await renderCheck(page, path, 1440, "regression-" + path.replaceAll("/", "-").replaceAll("?", "-"));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(base + "/planner", { waitUntil: "networkidle" });
  expect(posts.length).toBe(0);
  const budget = page.getByRole("spinbutton", { name: "Staff-hours available", exact: true });
  const run = page.getByRole("button", { name: "Run optimization", exact: true });
  await budget.fill("2001"); await expect(run).toBeDisabled();
  await budget.fill(""); await expect(run).toBeDisabled();
  await budget.fill("40.25"); await expect(run).toBeEnabled(); expect(posts.length).toBe(0);
  async function compare(value) {
    await budget.fill(value);
    const pending = nextResponse(page, (r) => r.url().endsWith("/plans/compare") && r.request().method() === "POST");
    await run.click(); const response = await pending; expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON().budget_hours).toBe(Number(value));
    await expect(run).toBeEnabled(); return response.json();
  }
  await page.route("**/api/plans/compare", async (route) => { await new Promise((resolve) => setTimeout(resolve, 500)); return route.fallback(); });
  const pendingComparison = compare("40.25");
  await expect(budget).toBeDisabled();
  await pendingComparison;
  await page.unroute("**/api/plans/compare");
  pass("Planner comparison pending state locks its budget control");
  await expect(page.getByRole("button", { name: "Save this plan", exact: true })).toBeEnabled();
  await budget.fill("41");
  await expect(page.getByRole("button", { name: "Save this plan", exact: true })).toBeDisabled();
  await expect(page.getByText(/Inputs changed/)).toBeVisible();
  pass("Planner requires explicit run; validates budget without clamping and blocks stale saves");
  const fractional = await compare("1.76");
  if (fractional.optimized.total_cost_hours > 1.76) {
    await expect(page.getByRole("alert")).toContainText("above the submitted budget");
    await expect(page.getByRole("button", { name: "Save this plan", exact: true })).toBeDisabled();
  }
  pass("Fractional request preserved; backend over-budget recommendation is flagged");
  await compare("0");
  await expect(page.getByText(/No action fits in/)).toBeVisible();
  pass("Zero budget preserves an empty recommendation");
  await page.route("**/api/plans/compare", (route) => route.fulfill({ status: 422, json: { detail: "Isolated planning failure" } }));
  await run.click(); await expect(page.getByRole("alert")).toContainText("Isolated planning failure");
  await page.unroute("**/api/plans/compare");
  await page.route("**/api/plans/compare", (route) => route.fulfill({ json: { optimized: null, baseline: null, candidates: [], assumptions: {} } }));
  await run.click(); await expect(page.getByText("Comparison result unavailable", { exact: true })).toBeVisible();
  await page.unroute("**/api/plans/compare");
  pass("Planner failed and missing comparison responses never become recommendations");
  await compare("40");
  await capture(page, "planner-result-1600.png");
  await page.screenshot({ path: join(shots, "planner-1600x1000.png") });
  async function savePlan(name) {
    await page.getByRole("button", { name: "Save this plan", exact: true }).click();
    await page.getByRole("textbox", { name: "Plan name", exact: true }).fill(name);
    const pending = nextResponse(page, (r) => r.url().endsWith("/api/plans") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    const response = await pending; expect(response.ok()).toBe(true); return response.json();
  }
  const rejectedPlan = await savePlan("Phase 4 isolated rejection");
  await expect(page.getByRole("button", { name: "Reject plan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reject plan", exact: true }).click();
  await expect(page.getByText("Give a reason for rejecting (at least 10 characters).")).toBeVisible();
  await page.getByRole("textbox", { name: "Decision note", exact: true }).fill("Rejected in isolated workflow verification.");
  const rejected = nextResponse(page, (r) => r.url().endsWith(`/plans/${rejectedPlan.id}/decision`));
  await page.getByRole("button", { name: "Reject plan", exact: true }).click();
  expect((await rejected).ok()).toBe(true);
  await expect(page.getByRole("dialog").getByText("Rejected", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  pass("Draft saving, decision validation and rejection persist through the real API");
  const approvedPlan = await savePlan("Phase 4 isolated approval");
  const approved = nextResponse(page, (r) => r.url().endsWith(`/plans/${approvedPlan.id}/decision`));
  await page.getByRole("button", { name: "Approve plan", exact: true }).click();
  const approvedResponse = await approved; expect(approvedResponse.ok()).toBe(true);
  const approvedData = await approvedResponse.json(); expect(approvedData.assignments.length).toBeGreaterThan(0);
  await expect(page.getByRole("dialog").getByText("Approved", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(base + `/follow-up?assignment=${approvedData.assignments[0].id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("textbox", { name: "What was done?", exact: true }).fill("Completed isolated reporting support; original records preserved.");
  const completed = nextResponse(page, (r) => r.url().endsWith(`/assignments/${approvedData.assignments[0].id}`) && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Mark as done", exact: true }).click();
  expect((await completed).ok()).toBe(true);
  await page.getByRole("combobox", { name: "Result", exact: true }).selectOption("observed_unverified");
  await page.getByRole("textbox", { name: "What did you see afterwards?", exact: true }).fill("Isolated observation recorded without a causal recovery claim.");
  const outcome = nextResponse(page, (r) => r.url().endsWith("/outcomes") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save result", exact: true }).click();
  expect((await outcome).ok()).toBe(true);
  pass("Approval creates assignments; follow-up completion and observed outcome recording remain functional");
  const recoveryResponse = nextResponse(page, (r) => r.url().includes("/api/recovery?") && r.request().method() === "GET");
  await renderCheck(page, "/recovery", 1600, "recovery");
  const recovery = await (await recoveryResponse).json();
  await page.getByRole("button", { name: "Show data table", exact: true }).first().click();
  await expect(page.getByRole("figure", { name: "Completeness and timeliness", exact: true }).getByRole("table")).toBeVisible();
  pass("Recovery charts use backend data and expose an accessible table");
  await page.route("**/api/recovery?**", (route) => route.fulfill({ json: { ...recovery, series: recovery.series.map((r) => ({ ...r, completeness: null, timeliness: null })), overall: { ...recovery.overall, completeness: null, timeliness: null } } }));
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Reporting series unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true })).toHaveCount(2);
  await page.unroute("**/api/recovery?**");
  pass("Recovery unavailable metrics remain unavailable and all-null series has an empty state");
  await page.goto(base + "/evaluation", { waitUntil: "networkidle" });
  await page.getByText("Configure and run evaluation", { exact: true }).click();
  const repetitions = page.getByRole("spinbutton", { name: "Number of runs", exact: true });
  const seed = page.getByRole("spinbutton", { name: "Base seed", exact: true });
  const evaluate = page.getByRole("button", { name: "Run evaluation", exact: true });
  await repetitions.fill("3.5"); await expect(evaluate).toBeDisabled();
  await repetitions.fill("3"); await seed.fill("10000001"); await expect(evaluate).toBeDisabled();
  await seed.fill(""); await expect(evaluate).toBeDisabled();
  await seed.fill("7100");
  const experimentResult = nextResponse(page, (r) => r.url().endsWith("/api/experiments") && r.request().method() === "POST");
  await evaluate.click(); await expect(seed).toBeDisabled();
  const experimentResponse = await experimentResult; expect(experimentResponse.ok()).toBe(true);
  const experiment = await experimentResponse.json();
  await expect(page.getByRole("heading", { name: "Detection method comparison", exact: true })).toBeVisible();
  await capture(page, "evaluation-result-1600.png");
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: join(shots, "evaluation-1600x1000.png") });
  pass("Evaluation integer/seed validation, explicit run, pending locks and real results");
  const reproduced = nextResponse(page, (r) => r.url().endsWith("/api/experiments") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Run evaluation", exact: true }).click();
  const reproducedData = await (await reproduced).json();
  expect(reproducedData.results.methods).toEqual(experiment.results.methods);
  pass("Identical replication count and seed reproduce the actual per-method metrics");
  const altered = structuredClone(experiment);
  for (const method of Object.values(altered.results.methods)) {
    method.overall.precision = null; method.overall.recall = 0; method.overall.f1 = null; method.overall.false_alarm_rate = 0;
  }
  altered.results.network_effect.precision_change = null;
  await page.route("**/api/experiments/*", (route) => route.fulfill({ json: altered }));
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Unavailable", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("table").getByText("0.0%", { exact: true }).first()).toBeVisible();
  await page.getByText("More results", { exact: true }).click();
  await expect(page.getByText(/precision not available/)).toBeVisible();
  pass("Unavailable precision/F1 and real zero recall/false-alarm values remain distinct");
  await page.route("**/api/experiments/*", (route) => route.fulfill({ json: { ...experiment, status: "failed", error: "Isolated failed experiment fixture", results: {} } }));
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("alert")).toContainText("This evaluation failed");
  await page.unroute("**/api/experiments/*");
  await page.route("**/api/experiments", async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ status: 422, json: { detail: "Isolated evaluation request rejected" } });
    return route.fallback();
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Configure and run evaluation", { exact: true }).click();
  await page.getByRole("button", { name: "Run evaluation", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Isolated evaluation request rejected");
  pass("Failed stored experiments and failed evaluation requests display errors");
  await page.unroute("**/api/experiments");
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto(base + "/evaluation", { waitUntil: "networkidle" });
  await page.getByText("Configure and run evaluation", { exact: true }).click();
  await page.getByRole("spinbutton", { name: "Number of runs", exact: true }).fill("3");
  await page.getByRole("spinbutton", { name: "Base seed", exact: true }).fill("0");
  await expect(page.getByRole("button", { name: "Run evaluation", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capture(page, "evaluation-form-320.png");
  await page.goto(base + `/planner?plan=${approvedPlan.id}`, { waitUntil: "networkidle" });
  const mobileSheet = page.getByRole("dialog");
  const box = await mobileSheet.boundingBox();
  expect(box.x >= 0 && box.x + box.width <= 321 && box.y >= 0 && box.height <= 1001).toBe(true);
  await page.keyboard.press("Tab");
  expect(await mobileSheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: join(shots, "plan-sheet-320.png") });
  await page.keyboard.press("Escape");
  await expect(mobileSheet).toHaveCount(0);
  pass("320px evaluation inputs and plan-sheet bounds, keyboard focus and Escape dismissal");
  await ctx.close();
  for (const [user, path, canRun] of [["U-PROV-MLY", "/planner", false], ["U-ADMIN", "/evaluation", true], ["U-RHU-HIRAYA", "/recovery", false]]) {
    const roleContext = await contextFor(user); const rolePage = await roleContext.newPage();
    await rolePage.goto(base + path, { waitUntil: "networkidle" });
    if (user === "U-RHU-HIRAYA") {
      await expect(rolePage.getByText(/is not available for/)).toBeVisible();
    } else {
      await expect(rolePage.locator("h1")).toBeVisible();
      if (canRun) await expect(rolePage.getByText("Configure and run evaluation", { exact: true })).toBeVisible();
      else await expect(rolePage.getByRole("link", { name: "Model evaluation", exact: true })).toHaveCount(0);
    }
    await roleContext.close();
  }
  pass("Provincial, administrator and RHU route/operation permissions retained");
  expect(forbidden).toEqual([]);
} catch (error) {
  results.push({ status: "FAIL", message: String(error.stack ?? error) });
  console.error(error); process.exitCode = 1;
} finally {
  writeFileSync(join(shots, process.argv.includes("--workflows-only") ? "workflow-results.json" : "results.json"), JSON.stringify(results, null, 2));
  await browser?.close(); if (backend && backend.exitCode === null) backend.kill();
}
