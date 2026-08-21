"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeSessionView, type ActiveSessionInput } from "@/lib/activeSession";
import { SessionWidget } from "@/components/SessionWidget";

type Active = ActiveSessionInput & { sessionId: string };

/** Height of the tab bar itself, before the home-indicator inset. */
export const NAV_HEIGHT = "3.75rem";
/** Clearance a page needs under it: tab bar alone, or tab bar plus widget. */
export const NAV_SPACE = "5rem";
export const CHROME_SPACE = "10.5rem";

/**
 * The app's bottom chrome: the tab bar, with the session widget riding on top
 * of it like a music app's mini player. Fixed and full width — it belongs to
 * the device, not to any one page.
 *
 * It fetches the active session itself; App Router keeps the root layout
 * mounted across navigations, so props from there would never notice a session
 * starting or finishing.
 */
export function AppChrome() {
  const pathname = usePathname();
  const [active, setActive] = useState<Active | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [refetch, setRefetch] = useState(0);

  const onSession = pathname.startsWith("/sessions/");
  const hidden = pathname.startsWith("/signin");

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    fetch("/api/active-session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setActive(data);
      })
      .catch(() => {}); // offline or signed out — leave it as it was
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

  const counting = active?.restEndsAtMs != null && active.restEndsAtMs > now;
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [counting]);

  if (hidden) return null;

  return (
    <>
      {/* Keeps page content clear of the fixed chrome — only as tall as the
          chrome actually is, so an idle app isn't padded for a widget. */}
      <div aria-hidden style={{ height: active && !onSession ? CHROME_SPACE : NAV_SPACE }} />
      <div className="fixed inset-x-0 bottom-0 z-40">
        {/* On the session page the runner renders its own copy, with the
            pause/stop controls and live state. */}
        {active && !onSession && (
          <Link
            href={`/sessions/${active.sessionId}`}
            aria-label="Return to your session"
            className="block active:opacity-90"
          >
            <SessionWidget
              view={activeSessionView(active, now)}
              trailing={
                <span className="grid size-11 shrink-0 place-items-center text-2xl text-zinc-400">
                  ›
                </span>
              }
            />
          </Link>
        )}
        <NavBar hasSession={Boolean(active)} sessionId={active?.sessionId ?? null} />
      </div>
    </>
  );
}

export function NavBar({
  hasSession,
  sessionId,
}: {
  hasSession: boolean;
  sessionId: string | null;
}) {
  const pathname = usePathname();
  const tabs = [
    { href: "/workouts", label: "Workouts", icon: <DumbbellIcon />, match: /^\/workouts/ },
    { href: "/history", label: "History", icon: <ClockIcon />, match: /^\/history/ },
    {
      href: hasSession && sessionId ? `/sessions/${sessionId}` : null,
      label: "Session",
      icon: <PlayIcon />,
      match: /^\/sessions/,
    },
    { href: "/settings", label: "Settings", icon: <GearIcon />, match: /^\/settings/ },
  ];

  return (
    <nav
      className="border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      style={{ boxShadow: "0 -1px 12px rgb(24 24 27 / 0.06)" }}
    >
      <div className="mx-auto flex w-full max-w-md" style={{ height: NAV_HEIGHT }}>
        {tabs.map((t) => {
          const activeTab = t.match.test(pathname);
          const cls = `flex flex-1 flex-col items-center justify-center gap-1 text-[0.65rem] font-medium transition ${
            activeTab ? "text-lime-600" : "text-zinc-400"
          }`;
          if (!t.href) {
            return (
              <span key={t.label} className={`${cls} opacity-40`} aria-disabled>
                {t.icon}
                {t.label}
              </span>
            );
          }
          return (
            <Link key={t.label} href={t.href} className={cls} aria-current={activeTab ? "page" : undefined}>
              {t.icon}
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

const ICON = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true } as const;

const DumbbellIcon = () => (
  <svg {...ICON} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
  </svg>
);
const ClockIcon = () => (
  <svg {...ICON} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
const PlayIcon = () => (
  <svg {...ICON} stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
    <path d="M9 6.5v11l8.5-5.5L9 6.5Z" />
  </svg>
);
const GearIcon = () => (
  <svg {...ICON} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2M12 18.5v2M4.9 7.8l1.7 1M17.4 15.2l1.7 1M4.9 16.2l1.7-1M17.4 8.8l1.7-1" />
  </svg>
);
