import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM assets that must not be bundled by the server compiler.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  async headers() {
    return [
      {
        // Never cache the service worker, or a push fix could take days to land.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
