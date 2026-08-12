"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeSessionView, type ActiveSessionInput } from "@/lib/activeSession";
import { SessionWidget, WIDGET_SPACE } from "@/components/SessionWidget";

type Active = ActiveSessionInput & { sessionId: string };

/**
 * The "you're mid-workout" widget on every page except the session itself,
 * where SessionRunner renders the same widget with pause/stop instead of the
 * chevron. Keeping the shape identical is the point: moving in and out of the
 * session shouldn't make it jump.
 *
 * It fetches its own state instead of taking server props — App Router keeps
 * the root layout mounted across client navigations, so props passed down from
 * there would never notice a session starting or finishing.
 */
export function ActiveSessionBar() {
  const pathname = usePathname();
  const [active, setActive] = useState<Active | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [refetch, setRefetch] = useState(0);

  // The session page renders its own copy, with controls.
  const hidden = pathname.startsWith("/sessions/") || pathname.startsWith("/signin");

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    fetch("/api/active-session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setActive(data);
      })
      .catch(() => {}); // offline or signed out — leave the widget as it was
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

  // Tick while there's a countdown running; the spinner animates in CSS.
  const counting = active?.restEndsAtMs != null && active.restEndsAtMs > now;
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [counting]);

  if (hidden || !active) return null;

  return (
    <>
      {/* Keeps page content clear of the fixed widget. */}
      <div aria-hidden style={{ height: WIDGET_SPACE }} />
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Link
          href={`/sessions/${active.sessionId}`}
          aria-label="Return to your session"
          className="block active:scale-[0.99]"
        >
          <SessionWidget
            view={activeSessionView(active, now)}
            trailing={<span className="shrink-0 pl-1 pr-1 text-lg text-zinc-600">›</span>}
          />
        </Link>
      </div>
    </>
  );
}
