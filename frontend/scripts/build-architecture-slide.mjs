// Builds a 16:9 pitch-deck slide of the IRIS system architecture, matching the Model A / B and validation slides:
//   docs/slides/IRIS-Architecture.png (3840×2160)
// Data → models (offline, Python) → JSON contract → backend (FastAPI, SQLite) → web app (React) → users,
// with reviews flowing back. App sections come from src/lib/navigation.ts. No servers needed.
// Usage: node scripts/build-architecture-slide.mjs
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(ROOT, "docs/slides/IRIS-Architecture.png");
mkdirSync(resolve(ROOT, "docs/slides"), { recursive: true });

// The app's top-level sections, read from the navigation so the slide follows the app.
const nav = readFileSync(resolve(ROOT, "frontend/src/lib/navigation.ts"), "utf8");
const sections = [...nav.matchAll(/label: "([^"]+)"[^\n]*top: true/g)].map((m) => m[1]);

const I = (d, w = 34) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  data: I(`<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>`),
  models: I(`<path d="M3 20h18M5 16l4-5 4 3 6-8"/><circle cx="19" cy="6" r="1.6"/>`),
  server: I(`<rect x="3.5" y="4" width="17" height="6.5" rx="1.5"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="1.5"/><path d="M7 7.2h.01M7 16.7h.01"/>`),
  app: I(`<rect x="2.5" y="4" width="19" height="13" rx="1.8"/><path d="M8.5 21h7M12 17v4"/>`),
  users: I(`<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.4 6-5.4s5.4 2 6 5.4"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.7c2.4.3 4 2 4.5 4.8"/>`),
};

const COLS = [
  { key: "data", title: "DATA", tech: "Real, public", icon: ICON.data, items: [["Dengue", "DOH via HDX"], ["18 diseases", "DOH EDCS"], ["Tuberculosis", "WHO"]] },
  { key: "models", title: "MODELS", tech: "Python · HiGHS", icon: ICON.models, items: [["Model A", "Detect"], ["Model B", "Decide"]], accent: true },
  { key: "server", title: "BACKEND", tech: "FastAPI · SQLite", icon: ICON.server, items: [["Flags", "3 detectors"], ["Concerns", "grouped by cause"], ["Planner", "staff-hour budget"], ["Demo world", "simulated", true]] },
  { key: "app", title: "WEB APP", tech: "React · TypeScript", icon: ICON.app, items: sections.map((s) => [s]) },
  { key: "users", title: "USERS", tech: "by role", icon: ICON.users, items: [["RESU analysts"], ["Provincial coordinators"], ["RHU staff"], ["Data managers"]] },
];
const ARROWS = ["clean<br>data", "JSON<br>files", "API", ""];

// Geometry (CSS px): five cards with arrow gaps between them.
const L = 70, CW = 300, GAP = 70, TOP = 220, CH = 460;
const cx = (i) => L + i * (CW + GAP);
const mid = (i) => cx(i) + CW / 2;
const loopY = TOP + CH + 62;

const mark = `data:image/png;base64,${readFileSync(resolve(ROOT, "docs/brand/iris-mark-bright-teal.png")).toString("base64")}`;
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  :root { --teal: #3FC1B0; --aqua: #4BF7FF; --violet: #7C3AED; --slate: #8FA3B1; --ink: #FFFFFF; --sub: #AEB8BC; --line: #3A3F42; --chip: #2C3134; }
  body { width: 1920px; height: 1080px; background: #232323; color: var(--ink); font-family: Poppins, Inter, system-ui, sans-serif; position: relative; overflow: hidden; }
  .logo { position: absolute; left: 70px; top: 52px; display: flex; align-items: center; gap: 10px; }
  .logo img { height: 34px; }
  .logo span { font-weight: 600; font-size: 30px; letter-spacing: .04em; color: var(--teal); }
  h1 { position: absolute; left: 0; right: 0; top: 54px; text-align: center; font-size: 46px; font-weight: 700; letter-spacing: .02em; }
  h1 small { display: block; font-size: 17px; font-weight: 600; letter-spacing: .32em; color: var(--teal); margin-top: 2px; }

  .card { position: absolute; top: ${TOP}px; width: ${CW}px; height: ${CH}px; border: 3px solid var(--teal); padding: 24px 22px; }
  .card.accent { border-color: var(--violet); }
  .head { display: flex; align-items: center; gap: 12px; color: var(--teal); }
  .accent .head { color: #A78BFA; }
  .head b { font-size: 22px; font-weight: 700; letter-spacing: .08em; color: var(--ink); }
  .tech { font-size: 14px; color: var(--sub); margin-top: 6px; }
  .items { display: grid; gap: 14px; margin-top: 22px; }
  .item { background: var(--chip); border-radius: 8px; padding: 10px 14px; }
  .item b { display: block; font-size: 19px; font-weight: 600; line-height: 1.25; }
  .item span { display: block; font-size: 15px; color: var(--sub); }
  .accent .item { padding: 18px 16px; border-left: 4px solid var(--aqua); }
  .accent .item b { font-size: 24px; } .accent .item span { font-size: 17px; color: var(--aqua); font-weight: 500; }
  .item.sim { background: none; border: 1.5px dashed var(--slate); }
  .item.sim span { color: var(--slate); }

  .arrow { position: absolute; top: ${TOP + CH / 2 - 30}px; width: ${GAP}px; text-align: center; }
  .arrow svg { display: block; margin: 0 auto; }
  .arrow p { font-size: 14px; color: var(--sub); line-height: 1.2; margin-top: 4px; }

  .loop { position: absolute; left: 0; top: 0; }
  .looplab { position: absolute; top: ${loopY - 13}px; left: ${mid(2)}px; width: ${mid(4) - mid(2)}px; text-align: center; }
  .looplab span { background: #232323; padding: 0 16px; font-size: 17px; font-weight: 600; color: var(--teal); }

  .foot { position: absolute; left: 70px; right: 70px; top: ${loopY + 74}px; text-align: center; font-size: 34px; font-weight: 500; }
  .foot b { color: var(--aqua); font-weight: 600; }
  .fine { position: absolute; left: 70px; right: 70px; bottom: 26px; text-align: center; font-size: 13px; line-height: 1.6; color: var(--sub); }
  .fine b { color: var(--ink); font-weight: 600; }
</style></head><body>
  <div class="logo"><img src="${mark}" alt=""><span>IRIS</span></div>
  <h1>SYSTEM ARCHITECTURE<small>FROM WEEKLY REPORTS TO ACTION</small></h1>

  ${COLS.map((c, i) => `<div class="card${c.accent ? " accent" : ""}" style="left:${cx(i)}px">
    <div class="head">${c.icon}<b>${c.title}</b></div><p class="tech">${c.tech}</p>
    <div class="items">${c.items.map(([b, s, sim]) => `<div class="item${sim ? " sim" : ""}"><b>${b}</b>${s ? `<span>${s}</span>` : ""}</div>`).join("")}</div>
  </div>`).join("")}

  ${ARROWS.map((t, i) => `<div class="arrow" style="left:${cx(i) + CW}px">
    <svg width="46" height="24" viewBox="0 0 46 24"><path d="M4 12h36M31 4l9 8-9 8" fill="none" stroke="#3FC1B0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
    ${t ? `<p>${t}</p>` : ""}</div>`).join("")}

  <svg class="loop" width="1920" height="1080" viewBox="0 0 1920 1080">
    <path d="M${mid(4)} ${TOP + CH + 4} V${loopY} H${mid(2)} V${TOP + CH + 14}" fill="none" stroke="#3FC1B0" stroke-width="3" stroke-dasharray="8 7" stroke-linejoin="round"/>
    <path d="M${mid(2) - 9} ${TOP + CH + 18} L${mid(2)} ${TOP + CH + 6} L${mid(2) + 9} ${TOP + CH + 18}" fill="none" stroke="#3FC1B0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <p class="looplab"><span>Reviews and evidence come back</span></p>

  <p class="foot">Models <b>flag and rank</b>. People <b>verify and decide</b>.</p>
  <p class="fine"><b>Notes:</b> The app reads model outputs but never changes them; reviews are stored separately and kept. The reporting network and demo workflow are simulated.
    <br>Research prototype, not an official DOH system.</p>
</body></html>`;

const tmp = mkdtempSync(join(tmpdir(), "iris-slide-"));
const file = join(tmp, "slide.html");
writeFileSync(file, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const overflow = await page.evaluate(() => [...document.querySelectorAll(".card")].filter((b) => b.scrollHeight > b.clientHeight + 1).map((b) => b.textContent.trim().slice(0, 20)));
await page.screenshot({ path: OUT });
await browser.close();
console.log(`Wrote ${OUT} (sections: ${sections.join(", ")}; overflow: ${overflow.join(", ") || "none"})`);
