// Builds docs/IRIS-User-Guide.pdf from docs/user-guide.html using headless Chromium.
// The cover is printed without a footer; the remaining pages get a footer with page numbers.
// Usage (from frontend/): node scripts/build-user-guide.mjs
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

const html = resolve(import.meta.dirname, "../../docs/user-guide.html");
const out = resolve(import.meta.dirname, "../../docs/IRIS-User-Guide.pdf");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(html).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const base = { format: "A4", printBackground: true, preferCSSPageSize: true };
const full = await page.pdf({
  ...base,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7.5px;color:#637579;padding:0 18mm;display:flex;justify-content:space-between;">
    <span>IRIS User Guide · research prototype · simulated data</span><span class="pageNumber"></span></div>`,
});
const cover = await page.pdf({ ...base, displayHeaderFooter: false, pageRanges: "1" });
await browser.close();

const doc = await PDFDocument.create();
const coverDoc = await PDFDocument.load(cover);
const fullDoc = await PDFDocument.load(full);
const [c] = await doc.copyPages(coverDoc, [0]);
doc.addPage(c);
const rest = await doc.copyPages(fullDoc, fullDoc.getPageIndices().slice(1));
rest.forEach((p) => doc.addPage(p));
doc.setTitle("IRIS User Guide");
doc.setSubject("Integrated Reporting Intervention System — research prototype user guide");
doc.setAuthor("Vince Anjo R. Villar");
doc.setCreator("IRIS documentation build");
writeFileSync(out, await doc.save());
console.log(`wrote ${out} (${doc.getPageCount()} pages)`);
