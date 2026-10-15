// Debug helper: lists the outermost elements that push a page wider than the viewport
// (ignoring content clipped by scroll containers). Usage: node scripts/find-overflow.mjs <width> <route> [user]
import { chromium } from "playwright";
const [w = "375", route = "/", user = "U-RESU-1"] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: Number(w), height: 900 } });
await ctx.addInitScript((u) => localStorage.setItem("iris.demoUser", u), user);
const p = await ctx.newPage();
await p.goto("http://localhost:5180" + route, { waitUntil: "networkidle" });
const out = await p.evaluate((vw) => {
  const clipped = (el) => { for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return true; } return false; };
  const res = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1 || r.width === 0 || clipped(el)) continue;
    const pr = el.parentElement.getBoundingClientRect();
    if (pr.right <= vw + 1) res.push(`${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).slice(0, 100)} w=${Math.round(r.width)}`);
  }
  return { sw: document.documentElement.scrollWidth, res: res.slice(0, 8) };
}, Number(w));
console.log(`scrollWidth ${out.sw} @ ${w}px ${route}\n  ` + out.res.join("\n  "));
await b.close();
