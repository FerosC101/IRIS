// One-off: write WebP and AVIF copies of the hero photos at several widths.
// Originals in src/assets/hero/ are read only and never modified.
// Usage: node scripts/optimize-images.mjs
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join, parse } from "node:path";
import sharp from "sharp";

const SRC = "src/assets/hero";
const OUT = join(SRC, "optimized");
const WIDTHS = [960, 1440, 1920];

mkdirSync(OUT, { recursive: true });
const rows = [];
for (const file of readdirSync(SRC).filter((f) => f.endsWith(".png"))) {
  const input = join(SRC, file);
  const { name } = parse(file);
  const meta = await sharp(input).metadata();
  for (const w of WIDTHS.filter((w) => w <= (meta.width ?? 0))) {
    for (const [ext, opts] of [["webp", { quality: 78 }], ["avif", { quality: 55 }]]) {
      const out = join(OUT, `${name}-${w}.${ext}`);
      // Resize only; no colour, crop or filter changes. The overlay is applied in CSS.
      await sharp(input).resize({ width: w })[ext](opts).toFile(out);
      rows.push(`${out}  ${(statSync(out).size / 1024).toFixed(0)} KB`);
    }
  }
  rows.push(`${input}  ${(statSync(input).size / 1024).toFixed(0)} KB (original, unchanged)`);
}
console.log(rows.join("\n"));
