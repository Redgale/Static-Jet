#!/usr/bin/env node
/**
 * scripts/generate-precache.js
 *
 * Run after `next build`. Scans out/_next/static/ for all hashed asset files
 * and writes out/precache-manifest.json so the service worker can pre-cache
 * them at install time — giving the app full offline support.
 */

const fs   = require("fs");
const path = require("path");

const OUT = path.resolve(__dirname, "..", "out");

function scan(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(full, results);
    } else {
      const url = "/" + path.relative(OUT, full).replace(/\\/g, "/");
      results.push(url);
    }
  }
  return results;
}

// Collect every /_next/static/ file (hashed chunks, CSS, media)
const nextStatic = path.join(OUT, "_next", "static");
const urls = fs.existsSync(nextStatic) ? scan(nextStatic).map(
  (u) => u  // already absolute from OUT root
) : [];

const manifest = { generated: new Date().toISOString(), urls };
const dest = path.join(OUT, "precache-manifest.json");
fs.writeFileSync(dest, JSON.stringify(manifest, null, 2));
console.log(`[generate-precache] wrote ${urls.length} URLs → out/precache-manifest.json`);
