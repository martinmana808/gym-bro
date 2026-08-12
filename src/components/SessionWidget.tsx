"use client";

import type { ReactNode } from "react";
import type { ActiveSessionView } from "@/lib/activeSession";
import { formatClock } from "@/lib/workout";

/** Height the widget occupies, reserved at the bottom of every page. */
export const WIDGET_SPACE = "5.75rem";

const ACCENTS = {
  working: { text: "text-lime-400", bar: "bg-lime-400", ring: "border-lime-400/40" },
  resting: { text: "text-sky-400", bar: "bg-sky-400", ring: "border-sky-400/40" },
  paused: { text: "text-zinc-400", bar: "bg-zinc-500", ring: "border-zinc-700" },
  done: { text: "text-amber-400", bar: "bg-amber-400", ring: "border-amber-400/40" },
} as const;

/**
 * The one session widget, shared by every page. Same shape everywhere so it
 * doesn't visually jump when you move in and out of the session: only the
 * trailing controls differ — a chevron elsewhere, pause/stop on the session.
 */
export function SessionWidget({
  view,
  trailing,
}: {
  view: ActiveSessionView;
  trailing: ReactNode;
}) {
  const accent = ACCENTS[view.mode];
  return (
    <div
      className={`mx-auto w-full max-w-md overflow-hidden rounded-2xl border ${accent.ring} bg-zinc-900/95 shadow-lg shadow-black/40 backdrop-blur`}
    >
      {/* How much of the workout is logged. */}
      <div className="h-1 w-full bg-zinc-800/80">
        <div
          className={`h-full ${accent.bar} transition-all duration-500`}
          style={{ width: `${Math.round(view.progress * 100)}%` }}
        />
      </div>
      <div className="flex items-stretch">
        <span className={`w-1 shrink-0 ${accent.bar}`} />
        {/* The label gets its own full-width row: sharing one with three
            buttons clipped even short workout names. */}
        <div className="min-w-0 flex-1 py-2 pl-2.5 pr-2">
          <p className="truncate text-[0.7rem] font-medium uppercase tracking-[0.06em] text-zinc-500">
            {view.label}
          </p>
          <div className="mt-0.5 flex items-center gap-2.5">
            <p className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="truncate font-semibold tracking-tight text-zinc-100">
                {view.primary}
              </span>
              <span className={`shrink-0 text-xs ${accent.text}`}>{view.detail}</span>
            </p>

            {/* Rest countdown when one is running, otherwise a "live" spinner. */}
            {view.secondsLeft != null ? (
              <span className={`shrink-0 text-xl font-bold tabular-nums ${accent.text}`}>
                {formatClock(view.secondsLeft)}
              </span>
            ) : (
              <ActivityDot mode={view.mode} className={accent.text} />
            )}

            {trailing}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Spinning ring while the workout is live; still and dim when paused. */
function ActivityDot({ mode, className }: { mode: ActiveSessionView["mode"]; className: string }) {
  if (mode === "paused") {
    return (
      <span aria-label="Paused" className={`shrink-0 ${className}`}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="2" opacity="0.4" />
        </svg>
      </span>
    );
  }
  return (
    <span aria-label="Session active" className={`shrink-0 ${className}`}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="animate-spin">
        <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <path
          d="M9 1.5a7.5 7.5 0 0 1 7.5 7.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

// Three of these share the row with the label, so they stay compact.
const ICON_BUTTON =
  "grid size-9 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-950/60 transition disabled:opacity-40";

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
      className={`${ICON_BUTTON} text-zinc-300 hover:border-lime-400 hover:text-lime-400`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        {paused ? (
          <path d="M4 2.5v11l9-5.5-9-5.5Z" />
        ) : (
          <>
            <rect x="3.5" y="2.5" width="3.5" height="11" rx="1" />
            <rect x="9" y="2.5" width="3.5" height="11" rx="1" />
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
      className={`${ICON_BUTTON} border-red-500/40 text-red-400 hover:border-red-400 hover:text-red-300`}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <rect x="2" y="2" width="12" height="12" rx="2.5" />
      </svg>
    </button>
  );
}

/** Replaces the old ▦ — a list, so it can't be mistaken for the stop square. */
export function SetsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Show all sets"
      title="Show all sets"
      className={`${ICON_BUTTON} text-zinc-400 hover:border-zinc-600 hover:text-zinc-100`}
    >
      <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
        <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M2.5 4.5h1.2M7 4.5h8.5" />
          <path d="M2.5 9h1.2M7 9h8.5" />
          <path d="M2.5 13.5h1.2M7 13.5h8.5" />
        </g>
      </svg>
    </button>
  );
}
