"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeSessionView, type ActiveSessionInput } from "@/lib/activeSession";
import { formatClock } from "@/lib/workout";

type Active = ActiveSessionInput & { sessionId: string };

/** Height reserved at the bottom of every page so nothing hides behind the bar. */
const BAR_SPACE = "5.5rem";

/**
 * The "you're mid-workout" bar, like a music app's now-playing row: present on
 * every page, one tap back into the session.
 *
 * It fetches its own state instead of taking server props — App Router keeps
 * the root layout mounted across client navigations, so props passed down from
 * there would never notice a session starting or finishing.
 */
export function ActiveSessionBar() {
  const pathname = usePathname();
  const [active, setActive] = useState<Active | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The session page is the full view; the bar would just duplicate it.
  const hidden = pathname.startsWith("/sessions/") || pathname.startsWith("/signin");

  // Bumped to force a refetch (returning to the app, finishing a session).
  const [refetch, setRefetch] = useState(0);

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    fetch("/api/active-session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setActive(data);
      })
      .catch(() => {}); // offline or signed out — leave the bar as it was
    return () => {
      cancelled = true;
    };
  }, [hidden, pathname, refetch]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setRefetch((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Only tick while there's something counting down.
  const resting = active?.restEndsAtMs != null && active.restEndsAtMs > now;
  useEffect(() => {
    if (!resting) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [resting]);

  if (hidden || !active) return null;

  const view = activeSessionView(active, now);
  const accent =
    view.mode === "resting"
      ? { text: "text-sky-400", bar: "bg-sky-400", ring: "border-sky-400/40" }
      : view.mode === "done"
        ? { text: "text-amber-400", bar: "bg-amber-400", ring: "border-amber-400/40" }
        : { text: "text-lime-400", bar: "bg-lime-400", ring: "border-lime-400/40" };

  return (
    <>
      {/* Keeps page content clear of the fixed bar. */}
      <div aria-hidden style={{ height: BAR_SPACE }} />
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Link
          href={`/sessions/${active.sessionId}`}
          aria-label={`Return to your session: ${view.label}`}
          className={`mx-auto flex w-full max-w-md items-center gap-3 overflow-hidden rounded-2xl border ${accent.ring} bg-zinc-900/95 py-2.5 pl-2.5 pr-4 shadow-lg shadow-black/40 backdrop-blur transition active:scale-[0.99]`}
        >
          <span className={`h-9 w-1 shrink-0 rounded-full ${accent.bar}`} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.7rem] font-medium uppercase tracking-[0.12em] text-zinc-500">
              {view.label}
            </span>
            <span className="mt-0.5 flex items-baseline gap-2">
              <span className="truncate font-semibold tracking-tight text-zinc-100">
                {view.primary}
              </span>
              <span className={`shrink-0 text-xs ${accent.text}`}>{view.detail}</span>
            </span>
          </span>
          {view.secondsLeft != null && (
            <span className={`shrink-0 text-xl font-bold tabular-nums ${accent.text}`}>
              {formatClock(view.secondsLeft)}
            </span>
          )}
          <span className="shrink-0 text-lg text-zinc-600">›</span>
        </Link>
      </div>
    </>
  );
}
