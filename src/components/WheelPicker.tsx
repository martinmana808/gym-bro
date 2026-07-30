"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HEIGHT, ITEM_H, PAD, indexFromScroll, rowGeometry, scrollForIndex } from "@/lib/wheel";

/** Row styling is driven by DISTANCE FROM THE CENTRE, not by which value is
 * selected — so the white row is always the one under the band, even mid-scroll.
 * Three tiers, as on the iOS drum: centre, neighbours, and the rest. */
function tierFor(absDistance: number): 0 | 1 | 2 {
  if (absDistance < 0.5) return 0;
  if (absDistance < 1.5) return 1;
  return 2;
}

const TIER_CLASS = ["text-white font-medium", "text-zinc-400", "text-zinc-500"] as const;

const Row = memo(function Row({
  label,
  tier,
  translateY,
  rot,
  opacity,
  onSelect,
}: {
  label: string;
  tier: 0 | 1 | 2;
  translateY: number;
  rot: number;
  opacity: number;
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
        className={`grid h-full place-items-center text-[28px] tabular-nums ${TIER_CLASS[tier]}`}
        style={{
          transform: `translateY(${translateY}px) rotateX(${rot}deg)`,
          transformOrigin: "center center",
          opacity,
          willChange: "transform, opacity",
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
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 pb-1 pt-4">
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-11 place-items-center rounded-full bg-zinc-800 text-xl text-zinc-300 transition hover:bg-zinc-700"
          >
            ✕
          </button>
          <span className="text-center text-base font-semibold text-zinc-100">{title}</span>
          <button
            onClick={onClose}
            aria-label="Done"
            className="grid size-11 place-items-center rounded-full bg-lime-400 text-xl font-bold text-zinc-950 transition hover:bg-lime-300 active:scale-[0.97]"
          >
            ✓
          </button>
        </div>

        <div className="relative mx-auto max-w-md px-4 pb-3">
          {/* centre band */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-4 z-0 rounded-2xl bg-zinc-800/70"
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
              height: HEIGHT,
              scrollSnapType: "y mandatory",
              perspective: 900,
              perspectiveOrigin: "center center",
            }}
          >
            <div style={{ height: PAD }} />
            {options.map((o, i) => {
              const d = i - centre;
              const g = rowGeometry(d);
              return (
                <Row
                  key={o}
                  label={labels?.[o] ?? o}
                  tier={tierFor(Math.abs(d))}
                  translateY={Math.round(g.translateY * 10) / 10}
                  rot={Math.round(g.rot * 10) / 10}
                  opacity={Math.round(g.opacity * 100) / 100}
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
