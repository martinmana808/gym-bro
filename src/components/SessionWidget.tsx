"use client";

import type { ReactNode } from "react";
import type { ActiveSessionView } from "@/lib/activeSession";

/** Height the widget occupies, reserved at the bottom of every page. */
export const WIDGET_SPACE = "6.5rem";

const ACCENTS = {
  working: { text: "text-lime-600", bar: "bg-lime-400", ring: "border-lime-500" },
  resting: { text: "text-sky-600", bar: "bg-sky-400", ring: "border-sky-500" },
  paused: { text: "text-zinc-500", bar: "bg-zinc-500", ring: "border-zinc-300" },
  done: { text: "text-amber-600", bar: "bg-amber-400", ring: "border-amber-500" },
} as const;

/**
 * The one session widget, shared by every page. Same shape everywhere so it
 * doesn't visually jump when you move in and out of the session: only the
 * trailing controls differ — a chevron elsewhere, sets/pause/stop on the
 * session itself.
 */
export function SessionWidget({
  view,
  trailing,
}: {
  view: ActiveSessionView;
  trailing: ReactNode;
}) {
  const accent = ACCENTS[view.mode];
  // Sits flush on the tab bar, so it's rounded and bordered on top only.
  return (
    <div
      className={`mx-auto w-full max-w-md rounded-t-2xl border-x-2 border-t-2 ${accent.ring} bg-white/95 px-4 pb-3 pt-3 backdrop-blur`}
    >
      {/* How much of the workout is logged. */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full ${accent.bar} transition-all duration-500`}
          style={{ width: `${Math.round(view.progress * 100)}%` }}
        />
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold tracking-tight text-zinc-900">
            {view.title}
            {view.timer && <span className={`ml-2 tabular-nums ${accent.text}`}>{view.timer}</span>}
          </p>
          <p className="mt-0.5 flex items-baseline gap-2.5 text-sm">
            <span className="truncate text-zinc-600">{view.subtitle}</span>
            {view.position && <span className={`shrink-0 ${accent.text}`}>{view.position}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{trailing}</div>
      </div>
    </div>
  );
}

const ICON_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200 active:scale-95 disabled:opacity-40";

export function PauseButton({
  paused,
  onClick,
  disabled,
}: {
  paused: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={paused ? "Resume workout" : "Pause workout"}
      title={paused ? "Resume workout" : "Pause workout"}
      className={ICON_BUTTON}
    >
      <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        {paused ? (
          <path d="M4 2.5v11l9-5.5-9-5.5Z" />
        ) : (
          <>
            <rect x="3.5" y="2.5" width="3.5" height="11" rx="1.2" />
            <rect x="9" y="2.5" width="3.5" height="11" rx="1.2" />
          </>
        )}
      </svg>
    </button>
  );
}

export function StopButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label="Finish workout"
      title="Finish workout"
      className={ICON_BUTTON}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <rect x="2" y="2" width="12" height="12" rx="2.5" />
      </svg>
    </button>
  );
}

/**
 * Toggles the all-sets grid. The icon flips to a single row when the grid is
 * open, so the same button reads as "back to one set".
 */
export function SetsButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={open ? "Back to the current set" : "Show all sets"}
      title={open ? "Back to the current set" : "Show all sets"}
      className={ICON_BUTTON}
    >
      {open ? (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
          <rect x="2" y="7.5" width="3" height="3" rx="1" />
          <rect x="7.5" y="7.5" width="3" height="3" rx="1" />
          <rect x="13" y="7.5" width="3" height="3" rx="1" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
          {[2, 7.5, 13].map((y) =>
            [2, 7.5, 13].map((x) => (
              <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" rx="1" />
            )),
          )}
        </svg>
      )}
    </button>
  );
}
