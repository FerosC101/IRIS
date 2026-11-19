// Builds device mockups of the running app: a laptop showing the dashboard and a phone showing a concern,
// drawn in HTML/CSS around real screenshots. Into docs/mockups/:
//   IRIS-Mockup-Light.png, IRIS-Mockup-Dark.png   both devices in a 16:9 scene (3840×2160)
//   IRIS-Laptop.png, IRIS-Phone.png               each device alone, transparent background, soft shadow
// Needs the backend on :8000 and the frontend on :5180. Usage: node scripts/build-device-mockup.mjs
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.IRIS_URL ?? "http://localhost:5180";
const ROOT = resolve(import.meta.dirname, "../..");
const tmp = mkdtempSync(join(tmpdir(), "iris-mockup-"));
const OUT = resolve(ROOT, "docs/mockups");
mkdirSync(OUT, { recursive: true });
const asURI = (file) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;

const browser = await chromium.launch();

async function shot({ path, width, height, scale, user = "U-RESU-1" }, name) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, reducedMotion: "reduce" });
  await ctx.addInitScript((u) => window.localStorage.setItem("iris.demoUser", u), user);
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const file = join(tmp, `${name}.png`);
  await page.screenshot({ path: file });
  await ctx.close();
  return asURI(file);
}

// The laptop shows a 1440×900 page (16:10). The phone is 390×844 (iPhone-sized): a 54 px status bar, then the page.
const laptopScreen = await shot({ path: "/", width: 1440, height: 900, scale: 2 }, "laptop");
const phoneScreen = await shot({ path: "/investigations/C-0012", width: 390, height: 844 - 54, scale: 3 }, "phone");
const mark = asURI(resolve(ROOT, "docs/brand/iris-mark-white.png"));
const markTeal = asURI(resolve(ROOT, "docs/brand/iris-mark-dark-teal.png"));

// The devices, shared by the scenes and the standalone images. Positions are set by whoever places them.
const deviceCSS = (shadow) => `
  * { box-sizing: border-box; margin: 0; }
  /* Laptop: lid with a thin dark bezel around a 16:10 screen, then a silver base with a finger notch. */
  .laptop { width: 1880px; filter: drop-shadow(0 60px 70px ${shadow}); }
  .lid { margin: 0 auto; width: 1640px; padding: 26px 26px 34px; border-radius: 38px 38px 10px 10px; background: #0C0F12;
         box-shadow: inset 0 0 0 2px #2A2F35, inset 0 0 0 5px #0C0F12, inset 0 0 0 6px #1B1F24; }
  .camera { width: 10px; height: 10px; border-radius: 99px; background: #23292F; margin: -14px auto 8px; box-shadow: 0 0 0 3px #15191D; }
  .screen { display: block; width: 1588px; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; border-radius: 6px; }
  .base { position: relative; height: 40px; border-radius: 4px 4px 34px 34px / 4px 4px 22px 22px;
          background: linear-gradient(#E9ECEE 0%, #C9CED2 45%, #9EA5AB 100%); box-shadow: inset 0 2px 0 #FFFFFF; }
  .base::before { content: ""; position: absolute; left: 50%; top: 0; width: 260px; height: 14px; transform: translateX(-50%);
                  border-radius: 0 0 16px 16px; background: linear-gradient(#B4BAC0, #C9CED2); }
  /* Phone: dark rounded body, thin metal edge, a pill-shaped island, a status bar, then the page. */
  .phone { position: relative; width: 470px; padding: 18px; border-radius: 76px; background: #0C0F12;
           box-shadow: 0 0 0 4px #3A4047, 0 0 0 6px #15191D, 0 50px 80px ${shadow}; }
  .display { width: 434px; aspect-ratio: 390 / 844; border-radius: 58px; overflow: hidden; background: #F7F9F9; display: flex; flex-direction: column; }
  .status { height: 60px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 6px 34px 0 46px;
            color: #0A3A4A; font: 600 19px Inter, system-ui, sans-serif; }
  .status svg { display: block; }
  .phone .screen { width: 100%; flex: 1; min-height: 0; border-radius: 0; }
  .island { position: absolute; left: 50%; top: 36px; width: 128px; height: 36px; transform: translateX(-50%); border-radius: 99px; background: #050607; z-index: 2; }
  .button { position: absolute; width: 6px; border-radius: 3px; background: #2C3238; }`;

const LAPTOP = `<div class="laptop">
  <div class="lid"><div class="camera"></div><img class="screen" src="${laptopScreen}" alt=""></div>
  <div class="base"></div>
</div>`;
const PHONE = `<div class="phone">
  <div class="island"></div>
  <span class="button" style="left:-10px; top:220px; height:80px"></span>
  <span class="button" style="left:-10px; top:320px; height:80px"></span>
  <span class="button" style="right:-10px; top:260px; height:120px"></span>
  <div class="display">
    <div class="status"><span>9:41</span>
      <span style="display:flex;gap:7px;align-items:center">
        <svg width="20" height="13" viewBox="0 0 20 13"><rect x="0" y="9" width="3.5" height="4" rx="1" fill="#0A3A4A"/><rect x="5.5" y="6" width="3.5" height="7" rx="1" fill="#0A3A4A"/><rect x="11" y="3" width="3.5" height="10" rx="1" fill="#0A3A4A"/><rect x="16.5" y="0" width="3.5" height="13" rx="1" fill="#0A3A4A"/></svg>
        <svg width="18" height="13" viewBox="0 0 18 13"><path d="M9 12.5 6.4 9.6a3.7 3.7 0 0 1 5.2 0Z" fill="#0A3A4A"/><path d="M3.8 7a7.4 7.4 0 0 1 10.4 0l-1.5 1.6a5.3 5.3 0 0 0-7.4 0Z" fill="#0A3A4A"/><path d="M1.2 4.3a11.1 11.1 0 0 1 15.6 0l-1.5 1.6a9 9 0 0 0-12.6 0Z" fill="#0A3A4A"/></svg>
        <svg width="28" height="13" viewBox="0 0 28 13"><rect x=".5" y=".5" width="24" height="12" rx="3.5" fill="none" stroke="#0A3A4A" opacity=".45"/><rect x="2.5" y="2.5" width="17" height="8" rx="2" fill="#0A3A4A"/><path d="M26 4.5v4a2 2 0 0 0 0-4Z" fill="#0A3A4A" opacity=".45"/></svg>
      </span>
    </div>
    <img class="screen" src="${phoneScreen}" alt="">
  </div>
</div>`;

async function render(name, html, { width, height, scale, selector, transparent = false }) {
  const file = join(tmp, `${name}.html`);
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8">${html}`);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.goto(pathToFileURL(file).href);
  await page.waitForLoadState("load");
  const out = resolve(OUT, `${name}.png`);
  await (selector ? page.locator(selector) : page).screenshot({ path: out, omitBackground: transparent });
  await page.close();
  console.log(`Wrote docs/mockups/${name}.png`);
}

// 1. Both devices in a 16:9 scene, on light and dark backgrounds.
const THEMES = {
  Light: { bg: "radial-gradient(ellipse at 30% 20%, #FFFFFF 0%, #EEF4F5 45%, #DCE8EA 100%)", shadow: "rgb(10 58 74 / .28)", text: "#0A3A4A", sub: "#4F6670", mark: markTeal },
  Dark: { bg: "radial-gradient(ellipse at 40% 25%, #0E4A5C 0%, #072634 50%, #04131D 100%)", shadow: "rgb(0 0 0 / .55)", text: "#FFFFFF", sub: "#A9C4CB", mark },
};
for (const [name, t] of Object.entries(THEMES)) {
  await render(`IRIS-Mockup-${name}`, `<style>${deviceCSS(t.shadow)}
    body { width: 2880px; height: 1620px; background: ${t.bg}; font-family: Inter, system-ui, sans-serif; overflow: hidden; position: relative; }
    .brand { position: absolute; left: 120px; top: 104px; display: flex; align-items: center; gap: 22px; }
    .brand img { height: 46px; }
    .brand p { font-size: 26px; font-weight: 600; letter-spacing: .02em; color: ${t.text}; }
    .brand span { display: block; font-size: 19px; font-weight: 400; letter-spacing: 0; color: ${t.sub}; margin-top: 4px; }
    body > .laptop { position: absolute; left: 250px; top: 230px; }
    body > .phone { position: absolute; left: 2050px; top: 500px; }
  </style></head><body>
    <div class="brand"><img src="${t.mark}" alt=""><p>IRIS<span>Integrated Reporting Intervention System</span></p></div>
    ${LAPTOP}${PHONE}
  </body></html>`, { width: 2880, height: 1620, scale: 4 / 3 });
}

// 2. Each device alone on a transparent background. The padding leaves room for the soft shadow.
const solo = (device, pad) => `<style>${deviceCSS("rgb(0 0 0 / .32)")}
  html, body { background: transparent; }
  #shot { display: inline-block; padding: ${pad}; }
</style></head><body><div id="shot">${device}</div></body></html>`;
await render("IRIS-Laptop", solo(LAPTOP, "40px 150px 170px"), { width: 2400, height: 1500, scale: 2, selector: "#shot", transparent: true });
await render("IRIS-Phone", solo(PHONE, "40px 110px 150px"), { width: 800, height: 1300, scale: 3, selector: "#shot", transparent: true });

await browser.close();
