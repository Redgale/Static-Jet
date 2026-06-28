# Scramjet Proxy

A fully static, serverless web proxy built on
[Scramjet](https://github.com/MercuryWorkshop/scramjet) by Mercury Workshop.

## How it works

| Layer | Role |
|---|---|
| **Next.js** | Generates the static React UI (`next build → out/`) |
| **Vite** | Compiles `src/sw.ts` → `public/sw.js` (the service worker) |
| **Scramjet** | Rewrites proxied HTML/JS/CSS inside the SW |
| **ScramjetController** | Manages iframe frames and the transport RPC bridge |
| **Epoxy (CDN)** | libcurl-over-Wisp transport — makes real HTTP requests from the browser |
| **Wisp (public)** | WebSocket-based TCP tunnel; no self-hosted server needed |

The browser address bar stays on **one URL** at all times.
Proxied content is displayed inside an iframe; the service worker rewrites
every request/response on the fly.

## Quick start

```bash
npm install
npm run build        # build:sw (Vite) then next build
# Static output is in ./out/
```

To run locally for development:
```bash
npm run dev          # Vite SW build + next dev
# Visit http://localhost:3000
```

## Deploying

The `out/` directory is a fully static site — upload it to any static host:

- **Netlify / Vercel (static)** — drag-and-drop or `netlify deploy --dir out`
- **GitHub Pages** — push `out/` to the `gh-pages` branch
- **Cloudflare Pages** — point at `out/`

> **Requirement:** the host must serve `sw.js` at the root path (`/sw.js`).
> All major static hosts do this automatically.

## Changing the Wisp server

Edit `WISP_URL` at the top of `components/ProxyApp.tsx`:

```ts
const WISP_URL = "wss://your-wisp-server.example.com/";
```

Any [Wisp-compatible](https://github.com/MercuryWorkshop/wisp-protocol) server works.

## Project structure

```
public/
  scramjet/
    scramjet.js          ← Scramjet runtime bundle (from Scramjet.zip)
    scramjet.wasm        ← Scramjet WASM module
  controller/
    controller.api.js    ← Controller main-thread API (from ScramJet_Controller.zip)
    controller.sw.js     ← Controller SW helper
    controller.inject.js ← Script injected into each proxied page
  sw.js                  ← Built by Vite from src/sw.ts

src/
  sw.ts                  ← Service worker TypeScript source

app/
  layout.tsx             ← Next.js root layout
  page.tsx               ← Loads ProxyApp (SSR disabled)
  globals.css            ← All styles

components/
  ProxyApp.tsx           ← Main proxy UI component

vite.sw.config.ts        ← Vite config (SW build only)
next.config.ts           ← Next.js static export config
```
