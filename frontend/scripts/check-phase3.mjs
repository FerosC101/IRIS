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
const shots = join(frontend, "qa-screenshots", "phase3", isolated ? "isolated" : "live");
mkdirSync(shots, { recursive: true });
const results = [];
const forbidden = [];
let backend;
let browser;
let target;
let database;

async function startIsolatedBackend() {
  database = join(mkdtempSync(join(tmpdir(), "iris-phase3-")), "browser-test.db");
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
  if (isolated) await startIsolatedBackend();
  browser = await chromium.launch({ channel: process.env.IRIS_BROWSER_CHANNEL || "msedge", headless: true });
  const context = await contextFor("U-RESU-1");
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const writes = [];
  page.on("request", (r) => { if (r.url().includes("/api/") && r.method() !== "GET") writes.push(r.url()); });
  // Render the actual supplied references for visual inspection.
  for (const [number, name] of [["05", "ReportingNetwork"], ["07", "AnomalyAnalysis"], ["08", "Investigations"], ["09", "InvestigationDetail"]]) {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(new URL(`../../design-reference/IRIS_Editable_Latest/IRIS_${number}_${name}.html`, import.meta.url).href);
    await page.screenshot({ path: join(shots, `reference-${number}.png`) });
  }
  for (const width of [1600, 1440, 1024, 768, 375, 320]) {
    for (const [path, name] of [["/network", "network"], ["/anomalies", "analysis"], ["/investigations", "queue"], ["/investigations/C-0012", "detail"]]) {
      await renderCheck(page, path, width, name);
    }
  }
  expect(writes).toEqual([]); pass("No mutation occurs on route render or navigation");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(base + "/network", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Search units").fill("no-such-unit");
  await expect(page.getByText("No units match these filters", { exact: true })).toBeVisible();
  await page.getByLabel("Search units").fill("");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("region", { name: "Reporting units (list view of the network)" })).toBeVisible();
  await page.getByRole("button", { name: /Reporting Hub/ }).first().click();
  await expect(page.getByRole("heading", { name: "Unit details", exact: true })).toBeVisible();
  pass("Network search, empty state, accessible list and node details");
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  for (const label of ["Zoom in", "Zoom out", "Fit to view", "Reset view and selection"]) await page.getByRole("button", { name: label, exact: true }).click();
  pass("Graph zoom, fit and reset controls");
  await page.goto(base + "/investigations?severity=high&status=active", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Updated", exact: true }).click();
  expect(page.url()).toContain("sort=updated_at");
  await page.getByRole("link", { name: /^C-/ }).first().click();
  await page.goBack({ waitUntil: "networkidle" });
  expect(page.url()).toContain("severity=high"); pass("Queue sort and back navigation preserve URL filters");
  await page.getByRole("searchbox", { name: "Search concerns", exact: true }).fill("no-such-concern-phase3");
  await page.getByRole("button", { name: "Show all open concerns", exact: true }).click();
  expect(page.url()).toContain("status=active");
  expect(new URL(page.url()).searchParams.get("severity")).toBe("");
  expect(new URL(page.url()).searchParams.get("search")).toBe("");
  pass("Queue empty-state reset clears filters in one URL update");
  await page.goto(base + "/anomalies", { waitUntil: "networkidle" });
  await page.getByLabel("Chart and findings reporting unit").selectOption("RHU-HIRAYA");
  await page.getByRole("button", { name: "Show data table" }).click();
  await expect(page.getByRole("figure", { name: /Reporting completeness/ }).getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Check for new concerns", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(writes).toEqual([]); pass("Analysis unit filter, chart table and cancellable explicit detection dialog");
  if (isolated) {
    for (const method of ["threshold", "ewma", "network"]) {
      await page.getByRole("button", { name: "Check for new concerns", exact: true }).click();
      await page.getByLabel("How to check").selectOption(method);
      const response = nextResponse(page, (r) => r.url().endsWith("/api/detection/run") && r.request().method() === "POST");
      await page.getByRole("button", { name: "Check now", exact: true }).click();
      expect((await response).ok()).toBe(true);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    pass("All three explicit detection methods execute against disposable database");
    await page.route("**/api/detection/run", (route) => route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: "Isolated test: analysis unavailable" }) }));
    await page.getByRole("button", { name: "Check for new concerns", exact: true }).click();
    await page.getByRole("button", { name: "Check now", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("Isolated test: analysis unavailable")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.unroute("**/api/detection/run");
    pass("Detection failure remains visible and dialog can be cancelled");
    await page.goto(base + "/investigations/C-0012", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /Notes & history/ }).click();
    await page.getByRole("textbox", { name: "Add a note", exact: true }).fill("Phase 3 isolated browser evidence review.");
    const noteResponse = nextResponse(page, (r) => r.url().endsWith("/notes") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    expect((await noteResponse).ok()).toBe(true);
    await expect(page.getByText("Phase 3 isolated browser evidence review.", { exact: true })).toBeVisible();
    pass("Investigation note saves and refreshes evidence history");
    await page.getByRole("button", { name: "More actions", exact: true }).click();
    await page.getByRole("button", { name: "Close as not a problem", exact: true }).click();
    await page.getByRole("button", { name: "Close concern", exact: true }).click();
    await expect(page.getByText("Please write a short sentence (at least 10 characters).")).toBeVisible();
    await page.getByLabel("Why is this not a problem?").fill("Isolated test review found no reporting problem.");
    const dismiss = nextResponse(page, (r) => r.url().endsWith("/dismiss") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Close concern", exact: true }).click();
    expect((await dismiss).ok()).toBe(true);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    pass("Dismiss requires a reason and refreshes investigation state");
    async function action(label) {
      const button = page.getByRole("button", { name: label, exact: true });
      if (!await button.isVisible()) await page.getByRole("button", { name: "More actions", exact: true }).click();
      await button.click();
    }
    async function reason(actionName, label, input, submit) {
      await action(label);
      await page.getByRole("dialog").getByRole("textbox").first().fill(input);
      const response = nextResponse(page, (r) => r.url().endsWith("/" + actionName) && r.request().method() === "POST");
      await page.getByRole("dialog").getByRole("button", { name: submit, exact: true }).click();
      expect((await response).ok()).toBe(true);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await reason("reopen", "Reopen", "Reopening for isolated workflow verification.", "Reopen");
    await reason("clarify", "Ask the unit a question", "Please verify the reporting submission history.", "Send question");
    await reason("respond", "Add the unit's reply", "The reporting history has been reviewed in this test.", "Send reply");
    await reason("confirm", "Confirm it's a real problem", "Isolated reviewer confirmed this synthetic reporting issue.", "Confirm");
    await action(/Change owner|Assign an owner/);
    await page.getByLabel("Owner", { exact: true }).selectOption("U-RESU-1");
    const assign = nextResponse(page, (r) => r.url().endsWith("/assign") && r.request().method() === "POST");
    await page.getByRole("dialog").getByRole("button", { name: "Assign", exact: true }).click();
    expect((await assign).ok()).toBe(true);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await reason("resolve", "Mark as resolved", "Isolated test resolution documented with reviewed evidence.", "Mark resolved");
    pass("Reopen, clarification, response, confirmation, assignment and resolution retain backend transitions");
    await page.goto(base + "/investigations/C-0019", { waitUntil: "networkidle" });
    const review = nextResponse(page, (r) => r.url().endsWith("/review") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Start review", exact: true }).click();
    expect((await review).ok()).toBe(true);
    pass("Start review applies the supported backend transition");

  }
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto(base + "/anomalies", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Check for new concerns", exact: true }).click();
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds.x >= 0 && bounds.x + bounds.width <= 321 && bounds.y >= 0).toBe(true);
  await page.keyboard.press("Tab");
  expect(await page.getByRole("dialog").evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  pass("320px dialog bounds, keyboard focus containment and mobile navigation");
  await context.close();
  for (const [user, path, allowed] of [["U-RHU-HIRAYA", "/investigations", false], ["U-PROV-MLY", "/anomalies", true], ["U-ADMIN", "/network", false]]) {
    const ctx = await contextFor(user); const p = await ctx.newPage();
    await p.goto(base + path, { waitUntil: "networkidle" });
    await expect(p.locator("h1")).toBeVisible();
    expect(await p.getByRole("link", { name: "Anomaly Analysis", exact: true }).count()).toBe(allowed ? 1 : 0);
    if (user === "U-RHU-HIRAYA") await expect(p.getByRole("button", { name: "Check for new concerns", exact: true })).toHaveCount(0);
    await ctx.close();
  }
  pass("RHU, provincial and administrator navigation permissions preserved");
  expect(forbidden).toEqual([]);
} catch (error) {
  results.push({ status: "FAIL", message: String(error.stack ?? error) });
  console.error(error); process.exitCode = 1;
} finally {
  writeFileSync(join(shots, "results.json"), JSON.stringify(results, null, 2));
  await browser?.close(); if (backend && backend.exitCode === null) backend.kill();
}
