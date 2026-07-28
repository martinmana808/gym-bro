"use client";

import { useEffect, useRef } from "react";
import { indexFromScroll, scrollForIndex } from "@/lib/wheel";

const ITEM_H = 44; // px per row
const VISIBLE = 5; // rows shown; must be odd so one row sits centred
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;

/**
 * An iOS-style wheel ("picker view") in a bottom sheet. Modern iOS renders a
 * native <select> as a flat menu, so the drum is built here: a scroll-snapping
 * column with a highlighted centre band and a faded top/bottom edge.
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
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startIndex = Math.max(0, options.indexOf(value));

  // Jump to the current value when the sheet opens (no smooth scroll: it should
  // already be under the centre band on the first frame).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = scrollForIndex(startIndex, ITEM_H);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const commitFromScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const i = indexFromScroll(el.scrollTop, ITEM_H, options.length);
    const next = options[i];
    if (next != null && next !== value) onChange(next);
  };

  const step = (delta: number) => {
    const el = listRef.current;
    if (!el) return;
    const i = indexFromScroll(el.scrollTop, ITEM_H, options.length);
    const target = Math.min(options.length - 1, Math.max(0, i + delta));
    el.scrollTo({ top: scrollForIndex(target, ITEM_H), behavior: "smooth" });
    const next = options[target];
    if (next != null && next !== value) onChange(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
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
            className="rounded-full bg-lime-400 px-5 py-1.5 text-sm font-bold text-zinc-950 transition hover:bg-lime-300 active:scale-[0.98]"
          >
            Done
          </button>
        </div>

        <div className="relative mx-auto max-w-md px-4 pb-3">
          {/* centre band */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-4 z-10 rounded-xl bg-zinc-800/70"
            style={{ height: ITEM_H, top: PAD }}
          />
          <div
            ref={listRef}
            tabIndex={0}
            onScroll={() => {
              if (settle.current) clearTimeout(settle.current);
              settle.current = setTimeout(commitFromScroll, 90);
            }}
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
            className="wheel-scroll relative overflow-y-scroll outline-none"
            style={{
              height: VISIBLE * ITEM_H,
              scrollSnapType: "y mandatory",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)",
              maskImage: "linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)",
            }}
          >
            <div style={{ height: PAD }} />
            {options.map((o) => (
              <div
                key={o}
                onClick={() => {
                  const el = listRef.current;
                  const i = options.indexOf(o);
                  el?.scrollTo({ top: scrollForIndex(i, ITEM_H), behavior: "smooth" });
                  if (o !== value) onChange(o);
                }}
                className={`grid cursor-pointer place-items-center text-xl tabular-nums transition-colors ${
                  o === value ? "font-semibold text-zinc-50" : "text-zinc-500"
                }`}
                style={{ height: ITEM_H, scrollSnapAlign: "center" }}
              >
                {labels?.[o] ?? o}
              </div>
            ))}
            <div style={{ height: PAD }} />
          </div>
        </div>
      </div>
    </div>
  );
}
