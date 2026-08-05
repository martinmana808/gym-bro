"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export const isIOS = () =>
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !("MSStream" in window);

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as { standalone?: boolean }).standalone)));

export type PushState = {
  /** The browser has Push at all (iOS Safari only exposes it once installed). */
  supported: boolean;
  subscribed: boolean;
  permission: NotificationPermission | "unsupported";
  busy: boolean;
  error: string | null;
  /** iOS, opened in a Safari tab — push can never work until it's installed. */
  needsInstall: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  sendTest: () => Promise<boolean>;
};

const canPush = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// Capability reads have to happen on the client only, so they go through
// useSyncExternalStore (never changes after load — subscribe is a no-op).
const noopSubscribe = () => () => {};
const serverFalse = () => false;

/** Registers the service worker and manages this device's push subscription. */
export function usePush(): PushState {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => canPush() && Boolean(VAPID_PUBLIC_KEY),
    serverFalse,
  );
  const needsInstall = useSyncExternalStore(
    noopSubscribe,
    () => isIOS() && !isStandalone(),
    serverFalse,
  );
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canPush()) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {});
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // Must be called from a user gesture or iOS rejects it outright.
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError(
          perm === "denied"
            ? "Notifications are blocked. Enable them for Gym Bro in iOS Settings › Notifications."
            : "Notification permission was dismissed.",
        );
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("save failed");
      setSubscribed(true);
    } catch {
      setError("Could not turn notifications on. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setError("Could not turn notifications off.");
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean };
      if (!json.ok) setError("The server had nothing to send to — try turning it off and on.");
      return Boolean(json.ok);
    } catch {
      setError("Could not send the test notification.");
      return false;
    }
  }, []);

  return {
    supported,
    subscribed,
    permission,
    busy,
    error,
    needsInstall,
    enable,
    disable,
    sendTest,
  };
}

/** Ask the server to push when this rest ends (no-op if push isn't on). */
export async function scheduleRestPush(input: {
  seconds: number;
  nextExercise: string | null;
  sessionId: string;
}) {
  try {
    await fetch("/api/push/rest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      keepalive: true,
    });
  } catch {
    // best effort — the in-app beep is still the primary alert
  }
}

/** Drop any pending rest push (skipped, extended, or moved on). */
export async function cancelRestPush() {
  try {
    await fetch("/api/push/rest", { method: "DELETE", keepalive: true });
  } catch {}
}
