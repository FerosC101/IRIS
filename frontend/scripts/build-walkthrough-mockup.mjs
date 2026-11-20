// Puts the walkthrough video on a laptop, with a transparent background:
//   docs/media/IRIS-walkthrough-laptop.webm  VP9 with alpha (Canva, Chrome, web pages)
//   docs/media/IRIS-walkthrough-laptop.mov   HEVC with alpha (Keynote, iMovie, Final Cut, Safari)
//   docs/media/IRIS-walkthrough-laptop.png   a transparent still of the same scene
// Renders frame by frame (each walkthrough frame placed on the screen, then captured without a background).
// Needs docs/media/IRIS-walkthrough.mp4 (scripts/build-walkthrough.mjs) and ffmpeg. No servers needed.
// Usage: node scripts/build-walkthrough-mockup.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "../..");
const SRC = resolve(ROOT, "docs/media/IRIS-walkthrough.mp4");
const OUT = resolve(ROOT, "docs/media/IRIS-walkthrough-laptop");
const W = 1920, H = 1080, FPS = 30;
const SCREEN_W = 1280, SCREEN_H = Math.round((SCREEN_W * 9) / 16);   // 16:9, so the whole video shows
const tmp = mkdtempSync(join(tmpdir(), "iris-laptop-"));
const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a], { stdio: "inherit" });

// 1. The walkthrough's frames, at the screen's size.
const inDir = join(tmp, "in"), outDir = join(tmp, "out");
mkdirSync(inDir); mkdirSync(outDir);
ff("-i", SRC, "-vf", `fps=${FPS},scale=${SCREEN_W * 2}:${SCREEN_H * 2}:flags=lanczos`, "-q:v", "2", join(inDir, "%04d.jpg"));
const frames = readdirSync(inDir).filter((f) => f.endsWith(".jpg")).sort();

// 2. The scene: a laptop (front view), nothing behind it but a faint shadow under its base.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; background: transparent; overflow: hidden; }
  .stage { position: absolute; inset: 0; }
  .shadow { position: absolute; left: 50%; top: ${(H + SCREEN_H + 94 + 34) / 2 - 18}px; width: ${SCREEN_W + 260}px; height: 40px; transform: translateX(-50%);
            border-radius: 50%; background: radial-gradient(ellipse at center, rgb(4 19 29 / .35), rgb(4 19 29 / 0) 70%); filter: blur(8px); }
  /* Laptop: dark bezel around a 16:9 screen, then a silver base with a finger notch. */
  .laptop { position: absolute; left: 50%; top: ${(H - SCREEN_H - 94 - 34) / 2}px; width: ${SCREEN_W + 220}px; transform: translateX(-50%); }
  .lid { margin: 0 auto; width: ${SCREEN_W + 52}px; padding: 26px 26px 34px; border-radius: 30px 30px 8px 8px; background: #0C0F12;
         box-shadow: inset 0 0 0 2px #2A2F35, inset 0 0 0 5px #0C0F12, inset 0 0 0 6px #1B1F24; }
  .camera { width: 9px; height: 9px; border-radius: 99px; background: #23292F; margin: -14px auto 7px; box-shadow: 0 0 0 3px #15191D; }
  .screen { display: block; width: ${SCREEN_W}px; height: ${SCREEN_H}px; object-fit: cover; border-radius: 4px; background: #000; }
  .base { position: relative; height: 34px; border-radius: 4px 4px 30px 30px / 4px 4px 20px 20px;
          background: linear-gradient(#EEF1F3 0%, #CDD3D7 45%, #9EA5AB 100%); box-shadow: inset 0 2px 0 #FFFFFF; }
  .base::before { content: ""; position: absolute; left: 50%; top: 0; width: 220px; height: 12px; transform: translateX(-50%);
                  border-radius: 0 0 14px 14px; background: linear-gradient(#B4BAC0, #CDD3D7); }
</style></head><body><div class="stage">
  <div class="shadow"></div>
  <div class="laptop"><div class="lid"><div class="camera"></div><img class="screen" id="s" alt=""></div><div class="base"></div></div>
</div></body></html>`;
const page_file = join(tmp, "scene.html");
writeFileSync(page_file, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(page_file).href);
for (const [i, f] of frames.entries()) {
  await page.evaluate(async (src) => { const img = document.getElementById("s"); img.src = src; await img.decode(); }, pathToFileURL(join(inDir, f)).href);
  await page.screenshot({ path: join(outDir, `${String(i + 1).padStart(4, "0")}.png`), omitBackground: true });
  if (i === Math.round(frames.length * 0.12)) await page.screenshot({ path: `${OUT}.png`, omitBackground: true });
}
await browser.close();
console.log(`rendered ${frames.length} frames`);

// 3. Encode with alpha.
const seq = join(outDir, "%04d.png");
ff("-framerate", String(FPS), "-i", seq, "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "24",
   "-auto-alt-ref", "0", "-row-mt", "1", "-an", `${OUT}.webm`);
ff("-framerate", String(FPS), "-i", seq, "-c:v", "hevc_videotoolbox", "-alpha_quality", "0.9", "-pix_fmt", "bgra", "-b:v", "12M",
   "-tag:v", "hvc1", "-an", "-movflags", "+faststart", `${OUT}.mov`);
console.log(`Wrote ${OUT}.webm, ${OUT}.mov and ${OUT}.png`);
