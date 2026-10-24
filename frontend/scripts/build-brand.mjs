// Builds the README's brand and design images, using the app's own fonts and colours:
//   docs/brand/iris-logo-light.png, docs/brand/iris-logo-dark.png   logo lockups (transparent)
//   docs/brand/IRIS-Design-System.png                               logos, palette, type, status styles
//   docs/design/IRIS-Mockups.png                                     the five concept mockups side by side
// No servers needed. Usage: node scripts/build-brand.mjs
import { chromium } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const url = (p) => pathToFileURL(resolve(ROOT, p)).href;
const font = (pkg, file) => url(`frontend/node_modules/@fontsource/${pkg}/files/${file}`);
const tmp = mkdtempSync(join(tmpdir(), "iris-brand-"));

const FONTS = `
  @font-face { font-family: "Space Grotesk"; font-weight: 500; src: url(${font("space-grotesk", "space-grotesk-latin-500-normal.woff2")}); }
  @font-face { font-family: "Space Grotesk"; font-weight: 600; src: url(${font("space-grotesk", "space-grotesk-latin-600-normal.woff2")}); }
  @font-face { font-family: Inter; font-weight: 400; src: url(${font("inter", "inter-latin-400-normal.woff2")}); }
  @font-face { font-family: Inter; font-weight: 500; src: url(${font("inter", "inter-latin-500-normal.woff2")}); }
  @font-face { font-family: Inter; font-weight: 600; src: url(${font("inter", "inter-latin-600-normal.woff2")}); }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Inter, sans-serif; color: #0A3A4A; }`;

const MARK = { dark: url("docs/brand/iris-mark-dark-teal.png"), bright: url("docs/brand/iris-mark-bright-teal.png"), white: url("docs/brand/iris-mark-white.png") };
const lockup = (mark, color, h = 64) =>
  `<div style="display:inline-flex;align-items:center;gap:${h * 0.3}px"><img src="${mark}" style="height:${h}px">` +
  `<span style="font-family:'Space Grotesk';font-weight:600;font-size:${h * 1.05}px;line-height:1;letter-spacing:.01em;color:${color}">IRIS</span></div>`;

const browser = await chromium.launch();

async function render(name, html, out, { width, height, transparent = false, selector = "#root" }) {
  const file = join(tmp, `${name}.html`);
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}</style></head><body>${html}</body></html>`);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.locator(selector).screenshot({ path: resolve(ROOT, out), omitBackground: transparent });
  await page.close();
  console.log(`Wrote ${out}`);
}

// 1. Logo lockups for the README header: one for GitHub's light theme, one for its dark theme.
await render("logo-light", `<div id="root" style="display:inline-block;padding:8px">${lockup(MARK.dark, "#0A3A4A")}</div>`, "docs/brand/iris-logo-light.png", { width: 600, height: 200, transparent: true });
await render("logo-dark", `<div id="root" style="display:inline-block;padding:8px">${lockup(MARK.white, "#FFFFFF")}</div>`, "docs/brand/iris-logo-dark.png", { width: 600, height: 200, transparent: true });

// 2. Design-system sheet.
const COLOURS = [
  ["Deep teal", "#0A3A4A", "Navigation, headings, text"],
  ["Teal", "#0E6680", "Primary actions, links, main series"],
  ["Data teal", "#1A9EA0", "Data marks, reports on time"],
  ["Bright aqua", "#5DD9DB", "Accents on dark surfaces"],
  ["Slate", "#7893A8", "Second chart series, estimates"],
  ["Ink 2", "#4F6670", "Secondary text, axes"],
  ["Line", "#A9BAC0", "Borders, dividers"],
  ["Tint", "#E7F1F2", "Panels, filter lead-ins"],
  ["Page", "#F7F9F9", "Page background"],
];
const STATUS = [
  ["Reporting normally", "#3E8E66", "#E3F2EA", "#2C6A4A", "Positive"],
  ["Some late reports", "#C98A1A", "#FBF1DC", "#7F5408", "Attention"],
  ["Missing reports", "#B65F59", "#FBE6E4", "#9B463F", "Critical"],
];
const label = (t) => `<p style="font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#4F6670;margin-bottom:14px">${t}</p>`;
const card = "background:#fff;border:1px solid #DCE4E6;border-radius:14px;padding:24px";
const sheet = `
<div id="root" style="width:1600px;background:#F7F9F9;padding:44px 48px;display:grid;gap:22px">
  <div style="display:flex;align-items:flex-end;justify-content:space-between">
    <div>
      <p style="font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#0E6680">Integrated Reporting Intervention System</p>
      <h1 style="font-family:'Space Grotesk';font-weight:600;font-size:40px;margin-top:6px">IRIS design system</h1>
    </div>
    <p style="max-width:560px;font-size:14px;line-height:1.55;color:#4F6670;text-align:right">Calm teal surfaces, one accent for data, and status colours kept for status only, always with a label. Every chart has a table view, and every model output says whether it is observed, estimated, flagged or verified.</p>
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px">
    <div style="${card};height:150px;display:flex;align-items:center;justify-content:center">${lockup(MARK.dark, "#0A3A4A", 52)}</div>
    <div style="${card};height:150px;display:flex;align-items:center;justify-content:center;background:#0A3A4A;border-color:#0A3A4A">${lockup(MARK.white, "#FFFFFF", 52)}</div>
    <div style="${card};height:150px;display:flex;align-items:center;justify-content:center;background:#04131D;border-color:#04131D">${lockup(MARK.bright, "#FFFFFF", 52)}</div>
  </div>

  <div style="display:grid;grid-template-columns:1.55fr 1fr;gap:18px">
    <div style="${card}">
      ${label("Colour")}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px 16px">
        ${COLOURS.map(([n, hex, role]) => `
          <div style="display:flex;gap:12px;align-items:center">
            <span style="width:54px;height:54px;flex-shrink:0;border-radius:10px;background:${hex};border:1px solid rgb(10 58 74 / .12)"></span>
            <span><span style="display:block;font-size:14px;font-weight:600">${n} <span style="font-weight:500;color:#4F6670;font-size:12.5px">${hex}</span></span>
            <span style="display:block;font-size:12.5px;color:#4F6670;margin-top:2px">${role}</span></span>
          </div>`).join("")}
      </div>
      <div style="margin-top:22px;border-top:1px solid #DCE4E6;padding-top:18px">
        ${label("Status (with an icon and a label, never colour alone)")}
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          ${STATUS.map(([t, c, bg, ink, n]) => `<span style="display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:6px;background:${bg};color:${ink};font-size:13.5px;font-weight:600"><span style="width:9px;height:9px;border-radius:99px;background:${c}"></span>${t}<span style="font-weight:500;opacity:.75">· ${n} ${c}</span></span>`).join("")}
        </div>
      </div>
      <div style="margin-top:22px;border-top:1px solid #DCE4E6;padding-top:18px">
        ${label("Chart series (at most two per chart, each with a legend and a table view)")}
        <div style="display:flex;gap:28px;align-items:center;font-size:13.5px">
          <span style="display:inline-flex;align-items:center;gap:10px"><svg width="34" height="10"><line x1="1" y1="5" x2="33" y2="5" stroke="#0E6680" stroke-width="2.5"/></svg>Observed (teal, solid)</span>
          <span style="display:inline-flex;align-items:center;gap:10px"><svg width="34" height="10"><line x1="1" y1="5" x2="33" y2="5" stroke="#7893A8" stroke-width="2.5" stroke-dasharray="5 4"/></svg>Comparison or estimate (slate, dashed)</span>
          <span style="display:inline-flex;align-items:center;gap:10px"><span style="width:26px;height:14px;border-radius:3px;background:#7893A8;opacity:.22"></span>Flagged weeks (shaded)</span>
        </div>
      </div>
    </div>
    <div style="${card};display:flex;flex-direction:column;gap:18px">
      ${label("Type")}
      <div style="margin-top:-8px">
        <p style="font-family:'Space Grotesk';font-weight:600;font-size:46px;line-height:1">Space Grotesk</p>
        <p style="font-size:13px;color:#4F6670;margin-top:8px">Headings, headline numbers and the wordmark · 500, 600</p>
        <p style="font-family:'Space Grotesk';font-weight:600;font-size:34px;margin-top:10px;font-variant-numeric:tabular-nums">81% · 12 of 15 · 3 weeks</p>
      </div>
      <div style="border-top:1px solid #DCE4E6;padding-top:16px">
        <p style="font-weight:600;font-size:30px;line-height:1">Inter</p>
        <p style="font-size:13px;color:#4F6670;margin-top:8px">Body text, labels, tables and controls · 400, 500, 600</p>
        <p style="font-size:15px;line-height:1.55;margin-top:10px">In weeks 38–40, Hiraya RHU sent 0 of 15 expected reports on time. A flag is a reason to check, not proof of a reporting failure.</p>
      </div>
    </div>
  </div>
</div>`;
await render("sheet", sheet, "docs/brand/IRIS-Design-System.png", { width: 1600, height: 900 });

// 3. The five concept mockups side by side, cropped to the same height from the top.
const MOCKS = ["dashboard", "reports-analysis", "reporting-network", "investigations-actions", "data-models"];
const W = 420, H = 500;
const strip = `
<div id="root" style="display:flex;gap:20px;padding:32px;background:#E9F0F1;width:max-content">
  ${MOCKS.map((m) => `<img src="${url(`docs/design/${m}.png`)}" style="width:${W}px;height:${H}px;object-fit:cover;object-position:top;border-radius:12px;border:1px solid #C9D6DA;box-shadow:0 6px 24px rgb(10 58 74 / .10);background:#fff">`).join("")}
</div>`;
await render("mockups", strip, "docs/design/IRIS-Mockups.png", { width: MOCKS.length * (W + 20) + 64, height: H + 64 });

await browser.close();
