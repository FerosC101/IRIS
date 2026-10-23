// One-off: favicons resized from the supplied dark-teal mark (no crop, colour or other edits).
// Usage: node scripts/make-favicons.mjs
import sharp from "sharp";

const SRC = "src/assets/brand/logo-dark-teal.png";
const OUT = [["public/favicon-32.png", 32], ["public/favicon-192.png", 192], ["public/favicon-512.png", 512], ["public/apple-touch-icon.png", 180]];
for (const [file, size] of OUT) {
  await sharp(SRC).resize(size, size).png().toFile(file);
  console.log(file, `${size}x${size}`);
}
