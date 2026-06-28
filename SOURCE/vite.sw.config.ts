import { defineConfig } from "vite";
import { resolve } from "path";

// Vite's sole role in this project: compile the TypeScript service worker
// to a classic-format (IIFE) script that browsers can register without
// needing ES-module service-worker support.
export default defineConfig({
  build: {
    outDir: "public",
    emptyOutDir: false,          // don't wipe the already-extracted assets
    rollupOptions: {
      input: resolve(__dirname, "src/sw.ts"),
      output: {
        entryFileNames: "sw.js",
        format: "iife",
        name: "__scramjetSW",    // IIFE wrapper var (unused at runtime)
        // Only the controller SW helper is needed here.
        // controller.sw.js is fully self-contained (bundles its own RPC
        // helper) and does NOT reference $scramjet at all — all request
        // rewriting happens on the main thread via RPC with the Controller.
        // Loading scramjet_bundled.js here would throw because it references
        // DOM APIs (document, window) that don't exist in a SW context.
        banner: "importScripts('/controller/controller.sw.js');",
      },
    },
  },
});
