import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Testing on a phone means hitting the dev server at this Mac's LAN address,
// which Next treats as a cross-origin request and blocks for dev assets.
// Read the addresses off the machine so a new DHCP lease doesn't break it.
const lanOrigins = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanOrigins,
  // The dev badge sits bottom-left, right on top of the Workouts tab.
  devIndicators: false,
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
