"use client";

/**
 * ProxyApp.tsx — Static Jet
 *
 * Boot sequence:
 *  1. Register /sw.js
 *  2. Wait for SW to control the page
 *  3. loadScript /scramjet/scramjet.js      → window.$scramjet
 *  4. loadScript /controller/controller.api.js → window.$scramjetController
 *  5. dynamic import libcurl-transport      → LibcurlClient
 *  6. new LibcurlClient({ wisp }) + transport.init()
 *  7. new Controller({ serviceworker, transport }) + controller.wait()
 *
 * Special URLs:
 *   home://staticjet  →  show the Static Jet home/splash screen
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

// ─── Wisp server ─────────────────────────────────────────────────────────────
const DEFAULT_WISP = "wss://admin.proxy.hydrovolter.com/scramjet/wisp/";
const WISP_KEY     = "staticjet_wisp_url";

function getSavedWisp(): string {
  try { return localStorage.getItem(WISP_KEY) || DEFAULT_WISP; } catch { return DEFAULT_WISP; }
}

// ─── Quick-nav suggestions ────────────────────────────────────────────────────
const SUGGESTIONS = [
  "wikipedia.org",
  "github.com",
  "developer.mozilla.org",
  "news.ycombinator.com",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const el = document.createElement("script");
    el.src = src;
    el.onload  = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(el);
  });
}

/** Returns the canonical URL to load, or "home" for the home screen. */
function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  // Home shortcut
  if (/^home:\/\/staticjet\/?$/i.test(s)) return "home://staticjet";
  if (/^https?:\/\//i.test(s)) return s;
  // Bare hostname
  if (/^[^\s]+\.[^\s]{2,}$/.test(s) && !s.includes(" ")) return "https://" + s;
  // Search
  return `https://duckduckgo.com/?q=${encodeURIComponent(s)}`;
}

function decodeProxyHref(href: string): string | null {
  try {
    const url = new URL(href);
    if (!url.pathname.startsWith("/~/sj/")) return null;
    const decoded = decodeURIComponent(url.pathname.slice("/~/sj/".length));
    return decoded.startsWith("http") ? decoded : null;
  } catch { return null; }
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = "booting" | "ready" | "error";

interface ScramjetControllerGlobal {
  Controller: new (init: {
    serviceworker: ServiceWorker;
    transport: unknown;
    config?: Partial<{ prefix: string; scramjetPath: string; injectPath: string; wasmPath: string }>;
  }) => {
    wait(): Promise<void>;
    createFrame(el: HTMLIFrameElement): ScramjetFrame;
    setTransport(t: unknown): void;
  };
}
interface ScramjetFrame { go(url: string): void; back(): void; forward(): void; reload(): void; }

declare global {
  interface Window { $scramjetController: ScramjetControllerGlobal; }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProxyApp() {
  const iframeRef  = useRef<HTMLIFrameElement>(null);
  const frameRef   = useRef<ScramjetFrame | null>(null);
  const rawCtrlRef = useRef<{
    createFrame(el: HTMLIFrameElement): ScramjetFrame;
    setTransport(t: unknown): void;
  } | null>(null);

  const [phase, setPhase]               = useState<Phase>("booting");
  const [bootMsg, setBootMsg]           = useState("Starting…");
  const [errMsg, setErrMsg]             = useState("");
  const [urlInput, setUrlInput]         = useState("");
  const [hasNavigated, setHasNavigated] = useState(false);

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wispUrl, setWispUrl]           = useState(getSavedWisp);
  // "default" = show only the hydrovolter button | "custom" = show text input
  const [wispMode, setWispMode]         = useState<"default" | "custom">(
    () => (getSavedWisp() === DEFAULT_WISP ? "default" : "custom")
  );
  const [customWispInput, setCustomWispInput] = useState(
    () => (getSavedWisp() === DEFAULT_WISP ? "" : getSavedWisp())
  );
  const [wispStatus, setWispStatus] = useState("");

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => { boot(getSavedWisp()); }, []); // eslint-disable-line

  async function boot(wisp: string) {
    setPhase("booting");
    setErrMsg("");
    try {
      if (!("serviceWorker" in navigator))
        throw new Error("Service Workers not supported in this browser.");

      setBootMsg("Registering service worker…");
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });

      if (!navigator.serviceWorker.controller) {
        setBootMsg("Activating service worker…");
        await new Promise<void>(resolve =>
          navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true })
        );
      }
      const sw = navigator.serviceWorker.controller!;

      setBootMsg("Loading Scramjet…");
      await loadScript("/scramjet/scramjet.js");

      setBootMsg("Loading controller…");
      await loadScript("/controller/controller.api.js");

      setBootMsg("Loading libcurl transport…");
      const { LibcurlClient } = await import("@mercuryworkshop/libcurl-transport");

      setBootMsg(`Connecting to Wisp server…`);
      const transport = new LibcurlClient({ wisp });
      await transport.init();

      setBootMsg("Starting controller…");
      const ctrl = new window.$scramjetController.Controller({
        serviceworker: sw,
        transport,
        config: {
          scramjetPath: "/scramjet/scramjet.js",
          wasmPath:     "/scramjet/scramjet.wasm",
          injectPath:   "/controller/controller.inject.js",
        },
      });
      rawCtrlRef.current = ctrl;
      await ctrl.wait();
      setPhase("ready");
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  // ── Wisp switcher ─────────────────────────────────────────────────────────
  const applyWisp = useCallback(async (url: string) => {
    const u = url.trim();
    if (!u) return;
    setWispStatus("Connecting…");
    try {
      const { LibcurlClient } = await import("@mercuryworkshop/libcurl-transport");
      const t = new LibcurlClient({ wisp: u });
      await t.init();
      rawCtrlRef.current?.setTransport(t);
      setWispUrl(u);
      try { localStorage.setItem(WISP_KEY, u); } catch {}
      setWispStatus("✓ Connected");
      setTimeout(() => setWispStatus(""), 2000);
    } catch (e: unknown) {
      setWispStatus("✗ " + (e instanceof Error ? e.message : String(e)));
    }
  }, []);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goHome = useCallback(() => {
    setHasNavigated(false);
    setUrlInput("");
    setSettingsOpen(false);
  }, []);

  const navigate = useCallback((raw: string) => {
    const target = normalizeUrl(raw);
    if (!target) return;
    // Home shortcut
    if (target === "home://staticjet") { goHome(); return; }
    setUrlInput(target);
    setHasNavigated(true);
    setSettingsOpen(false);
    const ctrl = rawCtrlRef.current;
    if (!ctrl || !iframeRef.current) return;
    if (!frameRef.current) frameRef.current = ctrl.createFrame(iframeRef.current);
    frameRef.current.go(target);
  }, [goHome]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") navigate(urlInput);
  }, [navigate, urlInput]);

  const onIframeLoad = useCallback(() => {
    try {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      const real = decodeProxyHref(win.location.href);
      if (real) setUrlInput(real);
    } catch {}
  }, []);

  const goBack    = useCallback(() => frameRef.current?.back(),    []);
  const goForward = useCallback(() => frameRef.current?.forward(), []);
  const reload    = useCallback(() => frameRef.current?.reload(),  []);

  const isReady = phase === "ready";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="proxy-shell">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="navbar">
        <div className="nav-dots">
          <span className="nav-dot red"/><span className="nav-dot yellow"/><span className="nav-dot green"/>
        </div>

        {/* Home */}
        <button className="nav-btn" onClick={goHome} disabled={!isReady} title="Home (home://staticjet)">
          ⌂
        </button>

        {/* Back / Forward / Reload */}
        <button className="nav-btn" onClick={goBack}    disabled={!isReady || !hasNavigated} title="Back">‹</button>
        <button className="nav-btn" onClick={goForward} disabled={!isReady || !hasNavigated} title="Forward">›</button>
        <button className="nav-btn" onClick={reload}    disabled={!isReady || !hasNavigated} title="Reload">↻</button>

        {/* URL bar */}
        <div className="url-wrap">
          <span className="url-icon">🔒</span>
          <input
            className="url-input"
            type="text" spellCheck={false} autoCapitalize="none" autoCorrect="off"
            placeholder={
              phase === "booting" ? bootMsg
              : phase === "error" ? "Error — see overlay"
              : "Search, URL, or home://staticjet"
            }
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={e => e.currentTarget.select()}
            disabled={!isReady}
          />
          {urlInput && isReady && (
            <button className="url-clear" onClick={() => setUrlInput("")} tabIndex={-1}>×</button>
          )}
        </div>

        <button className="go-btn" onClick={() => navigate(urlInput)} disabled={!isReady}>Go</button>

        {/* Settings */}
        <button
          className={`nav-btn settings-btn${settingsOpen ? " active" : ""}`}
          onClick={() => setSettingsOpen(o => !o)}
          title="Settings"
        >⚙</button>
      </nav>

      {/* ── Settings panel ─────────────────────────────────────────────────── */}
      {settingsOpen && (
        <div className="settings-panel">
          <p className="settings-heading">Wisp Server</p>
          <p className="settings-sub">
            The Wisp server routes your traffic. Different servers have different
            IP reputations — switch if a site returns SSL errors.
          </p>

          <div className="settings-presets">
            {/* Default (hydrovolter) */}
            <button
              className={`settings-preset${wispMode === "default" ? " active" : ""}`}
              onClick={() => {
                setWispMode("default");
                applyWisp(DEFAULT_WISP);
              }}
            >
              hydrovolter.com
            </button>

            {/* Custom */}
            <button
              className={`settings-preset${wispMode === "custom" ? " active" : ""}`}
              onClick={() => setWispMode("custom")}
            >
              ✏ Custom
            </button>
          </div>

          {/* Custom input — only shown when Custom is selected */}
          {wispMode === "custom" && (
            <div className="settings-row">
              <input
                className="settings-input"
                type="text"
                placeholder="wss://your-wisp-server/wisp/"
                value={customWispInput}
                onChange={e => setCustomWispInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && applyWisp(customWispInput)}
                spellCheck={false}
                autoFocus
              />
              <button
                className="settings-apply"
                onClick={() => applyWisp(customWispInput)}
              >Apply</button>
            </div>
          )}

          {wispStatus && <p className="settings-status">{wispStatus}</p>}

          <p className="settings-active">
            Active: <code>{wispUrl}</code>
          </p>

          <p className="settings-tip">
            💡 For the best compatibility, self-host a Wisp server on a
            residential IP (<code>wisp-server-python</code> or <code>wisp-js/server</code>).
            Custom servers are saved in your browser automatically.
          </p>
        </div>
      )}

      {/* ── Content area ───────────────────────────────────────────────────── */}
      <div className="content-area">
        {isReady && (
          <iframe
            ref={iframeRef}
            className="proxy-frame"
            title="Proxy content"
            onLoad={onIframeLoad}
          />
        )}

        {phase === "booting" && (
          <div className="overlay">
            <div className="spinner"/>
            <p className="overlay-msg">{bootMsg}</p>
          </div>
        )}

        {phase === "error" && (
          <div className="error-screen">
            <span className="error-icon">⚠️</span>
            <p className="error-title">Failed to start</p>
            <p className="error-msg">{errMsg}</p>
            <button className="retry-btn" onClick={() => boot(wispUrl)}>Retry</button>
          </div>
        )}

        {isReady && !hasNavigated && (
          <div className="splash">
            <div className="splash-logo">
              {/* Inline the SVG so it renders without a network request */}
              <svg className="splash-icon-svg" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <radialGradient id="sbg" cx="35%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#1a1a2e"/>
                    <stop offset="100%" stopColor="#0a0a12"/>
                  </radialGradient>
                </defs>
                <rect width="512" height="512" rx="112" fill="url(#sbg)"/>
                <path d="M396,94 L72,372 L232,284 Z" fill="#e94560"/>
                <path d="M396,94 L312,436 L232,284 Z" fill="#b02040"/>
                <path d="M396,94 L232,284" stroke="#ff6080" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
                <path d="M232,284 L196,354 L216,278 Z" fill="#ff7090"/>
                <line x1="148" y1="392" x2="108" y2="428" stroke="#e94560" strokeWidth="4" strokeLinecap="round" opacity="0.35"/>
                <line x1="124" y1="398" x2="92"  y2="426" stroke="#e94560" strokeWidth="3" strokeLinecap="round" opacity="0.2"/>
              </svg>
              <h1 className="splash-title">Static <span>Jet</span></h1>
              <p className="splash-sub">Static · Serverless · Powered by Scramjet</p>
            </div>

            <div className="splash-search">
              <input
                className="splash-input" type="text" autoFocus
                placeholder="Search, URL, or home://staticjet"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button className="splash-btn" onClick={() => navigate(urlInput)}>Go</button>
            </div>

            <div className="splash-suggestions">
              {SUGGESTIONS.map(s => (
                <button key={s} className="splash-chip" onClick={() => navigate(s)}>{s}</button>
              ))}
            </div>

            <p className="splash-wisp">
              Wisp: <code>{wispUrl}</code>
              {" — "}
              <button className="splash-settings-link" onClick={() => setSettingsOpen(true)}>
                change
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
