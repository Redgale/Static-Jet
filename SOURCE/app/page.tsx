"use client";
// Must be a Client Component so that `ssr: false` is valid in next/dynamic.

import dynamic from "next/dynamic";

// ProxyApp uses navigator.serviceWorker, window.$scramjetController, and
// iframe refs — none of which exist during server-side rendering.
// Disabling SSR keeps the build purely static and avoids hydration issues.
const ProxyApp = dynamic(() => import("../components/ProxyApp"), {
  ssr: false,
  loading: () => (
    <div className="boot-screen">
      <div className="spinner" />
      <p className="boot-msg">Starting…</p>
    </div>
  ),
});

export default function Home() {
  return <ProxyApp />;
}
