#!/usr/bin/env node
/**
 * scripts/generate-icons.js
 *
 * Converts the SVG source icons in public/icons/ to PNG for PWA use.
 * Run with: npm run generate-icons
 * Requires sharp (already a dependency via Next.js).
 */

const sharp = require("sharp");
const fs    = require("fs");
const path  = require("path");

const ICON_DIR = path.resolve(__dirname, "..", "public", "icons");

const targets = [
  { src: "icon-512.svg",         out: "icon-512.png",         size: 512 },
  { src: "icon-192.svg",         out: "icon-192.png",         size: 192 },
  { src: "apple-touch-icon.svg", out: "apple-touch-icon.png", size: 180 },
  { src: "favicon.svg",          out: "favicon.png",           size: 32  },
];

Promise.all(
  targets.map(({ src, out, size }) => {
    const srcPath = path.join(ICON_DIR, src);
    const outPath = path.join(ICON_DIR, out);
    return sharp(fs.readFileSync(srcPath))
      .resize(size, size)
      .png()
      .toFile(outPath)
      .then(() => console.log(`✓  ${out}  (${size}×${size})`));
  })
).catch((e) => {
  console.error("Icon generation failed:", e.message);
  process.exit(1);
});
