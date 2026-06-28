/// <reference lib="webworker" />
// src/sw.ts — compiled by Vite (vite.sw.config.ts) → public/sw.js
//
// The banner prepended by Vite adds:
//   importScripts('/controller/controller.sw.js');
// which sets $scramjetController.{shouldRoute, route} and also registers
// its own install (skipWaiting) and activate (clients.claim) listeners.
// Our handlers below add to those — they don't conflict.

/* eslint-disable no-restricted-globals */
declare const self: ServiceWorkerGlobalScope;
declare const $scramjetController: {
  shouldRoute: (event: FetchEvent) => boolean;
  route:       (event: FetchEvent) => Promise<Response>;
};

const CACHE = "staticjet-v1";

// ── App shell — pre-cached on install ────────────────────────────────────────
// These are stable URLs that don't change between builds.
// Next.js content-hashed chunks (/_next/static/**) are cached lazily below.
const SHELL = [
  "/",
  "/manifest.json",
  "/icons/favicon.svg",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/icons/apple-touch-icon.svg",
  "/scramjet/scramjet.js",
  "/scramjet/scramjet.wasm",
  "/controller/controller.api.js",
  "/controller/controller.sw.js",
  "/controller/controller.inject.js",
];

// Pre-cache the app shell so the UI is available offline.
// controller.sw.js already calls skipWaiting() — no need to repeat it here.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL))
  );
});

// Remove caches from previous installs.
// controller.sw.js already calls clients.claim() — no need to repeat it here.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
});

// ── Fetch handler ─────────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  // 1. Proxy traffic → let Scramjet handle it
  if ($scramjetController.shouldRoute(e)) {
    e.respondWith($scramjetController.route(e));
    return;
  }

  // Only intercept same-origin GETs beyond this point
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // 2. Next.js hashed static chunks — immutable, so cache-first forever
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        if (hit) return hit;
        return fetch(e.request).then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // 3. App shell (/, /manifest.json, scramjet assets, icons…)
  //    Network-first so updates reach users; falls back to cache when offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(
          (hit) => hit ?? new Response("Static Jet is offline", { status: 503 })
        )
      )
  );
});
