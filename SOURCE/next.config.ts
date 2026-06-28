import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  webpack(config) {
    // Enable WebAssembly — needed by libcurl-transport (and epoxy-transport if
    // you ever switch back).  asyncWebAssembly lets webpack bundle .wasm files
    // that packages reference via new URL("*.wasm", import.meta.url).
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
};

export default nextConfig;
