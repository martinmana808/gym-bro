"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { indexFromScroll, scrollForIndex } from "@/lib/wheel";

const ITEM_H = 40; // px per row
const VISIBLE = 7; // rows shown; odd so one row sits centred
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;

/** Row styling is driven by DISTANCE FROM THE CENTRE, not by which value is
 * selected — so the white row is always the one under the band, even mid-scroll.
 * Three tiers, as on the iOS drum: centre, neighbours, and the faded rest. */
function tierFor(absDistance: number): 0 | 1 | 2 {
  if (absDistance < 0.5) return 0;
  if (absDistance < 1.5) return 1;
  return 2;
}

const TIER_CLASS = [
  "text-white font-semibold",
  "text-zinc-500",
  "text-zinc-700",
] as const;

const Row = memo(function Row({
  label,
  tier,
  rot,
  scale,
  onSelect,
}: {
  label: string;
  tier: 0 | 1 | 2;
  rot: number;
  scale: number;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className="cursor-pointer"
      style={{ height: ITEM_H, scrollSnapAlign: "center" }}
    >
      {/* Transform lives on an inner node so scroll-snap still measures the
          untransformed row box (otherwise snapping drifts). */}
      <div
        className={`grid h-full place-items-center text-2xl tabular-nums ${TIER_CLASS[tier]}`}
        style={{
          transform: `rotateX(${rot}deg) scale(${scale})`,
          transformOrigin: "center center",
          willChange: "transform",
        }}
      >
        {label}
      </div>
    </div>
  );
});

/**
 * An iOS-style wheel ("picker view") in a bottom sheet. Modern iOS renders a
 * native <select> as a flat menu, so the drum is built here: a scroll-snapping
 * column, a highlighted centre band, three distance-based colour tiers, and a
 * faked cylinder (rows rotate away and shrink towards the edges).
 *
 * Rendered through a portal: the trigger usually sits inside a <label>, and a
 * click anywhere inside a label is forwarded to its control — which would eat
 * every tap on Done and on the backdrop.
 */
export function WheelPicker({
  options,
  labels,
  value,
  onChange,
  onClose,
  title,
}: {
  options: string[];
  /** Optional display text per option (defaults to the option itself). */
  labels?: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  title?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const startIndex = Math.max(0, options.indexOf(value));
  // Fractional centre position, in rows. Drives colour + curvature live.
  const [centre, setCentre] = useState(startIndex);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Open already scrolled to the current value.
  useEffect(() => {
    if (!mounted) return;
    const el = listRef.current;
    if (el) {
      el.scrollTop = scrollForIndex(startIndex, ITEM_H);
      setCentre(startIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  const handleScroll = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = listRef.current;
      if (el) setCentre(el.scrollTop / ITEM_H);
    });
  };

  // Commit whenever the centred row changes, so the field tracks the drum live.
  const centreIndex = indexFromScroll(centre * ITEM_H, ITEM_H, options.length);
  useEffect(() => {
    const next = options[centreIndex];
    if (next != null && next !== value) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreIndex]);

  const scrollToIndex = useCallback((i: number) => {
    listRef.current?.scrollTo({ top: scrollForIndex(i, ITEM_H), behavior: "smooth" });
  }, []);

  const step = (delta: number) =>
    scrollToIndex(Math.min(options.length - 1, Math.max(0, centreIndex + delta)));

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        aria-label="Close picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div className="relative w-full rounded-t-3xl border-t border-zinc-800 bg-zinc-900 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <span className="text-sm text-zinc-400">{title}</span>
          <button
            onClick={onClose}
            className="rounded-full bg-lime-400 px-6 py-2 text-sm font-bold text-zinc-950 transition hover:bg-lime-300 active:scale-[0.98]"
          >
            Done
          </button>
        </div>

        <div className="relative mx-auto max-w-md px-4 pb-3">
          {/* centre band */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-4 z-0 rounded-xl bg-zinc-800/80 ring-1 ring-white/5"
            style={{ height: ITEM_H, top: PAD }}
          />
          <div
            ref={listRef}
            tabIndex={0}
            onScroll={handleScroll}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                step(1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                step(-1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                onClose();
              }
            }}
            className="wheel-scroll relative z-10 overflow-y-scroll outline-none"
            style={{
              height: VISIBLE * ITEM_H,
              scrollSnapType: "y mandatory",
              perspective: 520,
              perspectiveOrigin: "center center",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.25) 10%, #000 34%, #000 66%, rgba(0,0,0,0.25) 90%, transparent 100%)",
              maskImage:
                "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.25) 10%, #000 34%, #000 66%, rgba(0,0,0,0.25) 90%, transparent 100%)",
            }}
          >
            <div style={{ height: PAD }} />
            {options.map((o, i) => {
              const d = i - centre;
              const ad = Math.abs(d);
              // Rows rotate away from the viewer and shrink towards the edges,
              // so the column reads as the surface of a rotating cylinder.
              const rot = Math.round(Math.max(-72, Math.min(72, d * 24)));
              const scale = Math.round(Math.max(0.66, 1 - ad * 0.09) * 100) / 100;
              return (
                <Row
                  key={o}
                  label={labels?.[o] ?? o}
                  tier={tierFor(ad)}
                  rot={rot}
                  scale={scale}
                  onSelect={() => scrollToIndex(i)}
                />
              );
            })}
            <div style={{ height: PAD }} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
