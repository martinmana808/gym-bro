"use client";

import { useEffect } from "react";

/** Registers /sw.js once per app load. The worker only handles push. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {}); // unsupported or blocked — the app works without it
  }, []);
  return null;
}
