// Non-destructive visual smoke checks. No reset, detection, import, or workflow
// mutations. Existing GET endpoints and planner comparison may sync candidates
// on the backend; this script does not change that existing server behavior.
// Usage: node scripts/check-foundation.mjs [baseUrl] [screenshotDir]
// IRIS_BROWSER_CHANNEL=msedge uses installed Edge; default uses Playwright Chromium.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:5180";
const shots = process.argv[3];
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ channel: process.env.IRIS_BROWSER_CHANNEL || undefined });
const failures = [];
const routes = ["/", "/investigations", "/investigations/C-0010", "/network", "/data", "/data?tab=trends", "/data/import", "/planner", "/follow-up", "/recovery", "/evaluation", "/data-management", "/data-management/DS-DEMO-FACILITY", "/settings", "/help"];
let checks = 0;

async function session(user) {
  const context = await browser.newContext();
  await context.addInitScript((id) => {
    if (!localStorage.getItem("iris.demoUser")) localStorage.setItem("iris.demoUser", id);
  }, user);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" || (request.method() === "POST" && path === "/api/plans/compare")) return route.continue();
    failures.push(`Blocked unexpected mutation: ${request.method()} ${path}`);
    await route.abort();
  });
  return context;
}

async function check(page, route, width, user) {
  const errors = [];
  const onError = (error) => errors.push(error.message);
  const onConsole = (message) => { if (message.type() === "error") errors.push(message.text()); };
  const onResponse = (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  page.on("response", onResponse);
  try {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + route, { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      font: getComputedStyle(document.body).fontFamily,
      fontLoaded: [400, 500, 600, 700].every((weight) => document.fonts.check(`${weight} 16px Poppins`)),
      loadedFamilies: [...document.fonts].filter((font) => font.status === "loaded").map((font) => font.family),
      brokenImages: [...document.images].filter((img) => !img.complete || !img.naturalWidth).map((img) => img.src),
    }));
    expect(state.overflow).toBe(false);
    expect(state.font.replaceAll('"', "")).toBe('Poppins, sans-serif');
    expect(state.fontLoaded).toBe(true);
    expect(state.loadedFamilies.every((family) => family.replaceAll('"', "") === "Poppins")).toBe(true);
    expect(state.brokenImages).toEqual([]);
    expect(errors).toEqual([]);
    if (shots && ["/", "/network", "/data", "/planner"].includes(route)) {
      await page.screenshot({ path: join(shots, `${user}-${width}-${route.replaceAll("/", "_") || "home"}.png`), fullPage: true });
    }
    checks++;
    console.log(`PASS ${user} ${width}px ${route}`);
  } catch (error) {
    failures.push(`${user} ${width}px ${route}: ${error.message}`);
    console.error(`FAIL ${user} ${width}px ${route}: ${error.message}`);
  } finally {
    page.off("pageerror", onError);
    page.off("console", onConsole);
    page.off("response", onResponse);
  }
}

try {
  const context = await session("U-RESU-1");
  const page = await context.newPage();
  for (const width of [375, 1600]) for (const route of routes) await check(page, route, width, "U-RESU-1");
  for (const width of [320, 768, 1024, 1440]) await check(page, "/", width, "U-RESU-1");
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(base, { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: "Open navigation menu" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  console.log("PASS mobile navigation opens, closes with Escape, and restores focus");
  for (const asset of ["iris_logo_updated.png", "iris_logo_glossy_original.png", "iris_logo_flat_transparent.png", "iris_logo_vector.svg", "iris_micrograin.png", "iris_mesh_wave.svg", "healthcare_analysts.webp"]) {
    const result = await page.evaluate((name) => new Promise((resolve) => {
      const img = new Image(); img.onload = () => resolve(img.naturalWidth > 0); img.onerror = () => resolve(false); img.src = `/brand/${name}`;
    }), asset);
    expect(result, asset).toBe(true);
  }
  console.log("PASS all seven supplied brand/texture/hero assets decode");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/investigations", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Check for new concerns", exact: true }).click();
  const detectionDialog = page.getByRole("dialog", { name: "Check for new concerns" });
  await expect(detectionDialog).toBeVisible();
  await detectionDialog.getByRole("combobox").selectOption("ewma");
  await expect(detectionDialog.getByRole("combobox")).toHaveValue("ewma");
  await detectionDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(detectionDialog).toHaveCount(0);
  console.log("PASS detection configuration opens, accepts method selection, and cancels without running");
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("aside select").selectOption("U-ADMIN");
  expect(await page.evaluate(() => localStorage.getItem("iris.demoUser"))).toBe("U-ADMIN");
  // Session refresh is outside this visual phase. Report its observed behavior
  // honestly instead of changing the existing identity/query implementation.
  try {
    await expect(page.locator("aside select")).toHaveValue("U-ADMIN", { timeout: 2000 });
    console.log("PASS demo role selection refreshes the active session immediately");
  } catch {
    console.warn("KNOWN LIMITATION: demo role selection persists but the visible session requires a reload; identity code is unchanged.");
  }
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("aside select")).toHaveValue("U-ADMIN");
  await expect(page.getByText("Data Manager", { exact: true })).toBeVisible();
  console.log("PASS demo role selection persists and activates after reload");
  await context.close();
  for (const [user, paths] of [
    ["U-ADMIN", ["/data-management?tab=activity", "/data-management?tab=units", "/settings"]],
    ["U-RHU-HIRAYA", ["/", "/data", "/follow-up"]],
    ["U-PROV-MLY", ["/", "/planner", "/investigations/C-0010"]],
  ]) {
    const roleContext = await session(user);
    const rolePage = await roleContext.newPage();
    for (const path of paths) await check(rolePage, path, 375, user);
    await roleContext.close();
  }
} finally {
  await browser.close();
}
console.log(`${checks} route/viewport checks passed.`);
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
