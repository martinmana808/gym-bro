"use client";

import {
  applyResult,
  COMPLAIN_AFTER,
  enqueue,
  OUTBOX_KEY,
  parseQueue,
  serializeQueue,
  waiting,
  type OutboxEntry,
  type OutboxOp,
  type OutboxResult,
} from "./outbox";

/**
 * The one outbox for the whole app: session writes recorded on the phone and
 * uploaded when there's signal.
 *
 * A module-level store rather than component state, because two different
 * places need it at once — the session screen, to show what's outstanding, and
 * the bottom chrome, which is mounted on every page and does the actual
 * draining. Per-component state would mean two queues racing each other, and a
 * queue that only drains while you happen to be looking at the session you
 * logged it from: finish a workout in a basement, open the app on the bus at
 * the home screen, and nothing would upload.
 *
 * `localStorage` on purpose: it commits synchronously, so a write survives iOS
 * killing the app in the instant after the tap. IndexedDB's async commit is
 * exactly what gets lost there.
 */

/** How often to try again while something is waiting. */
const RETRY_MS = 15_000;
/** How long "Saved" stays on screen after the queue empties. */
const SAVED_MS = 2500;

export type OutboxStatus = {
  /** Sets and other changes still on the phone. */
  pending: { sets: number; other: number };
  /** An upload is in flight right now. */
  syncing: boolean;
  /** Tried and failed enough times that it's worth saying so. */
  stuck: boolean;
  /** The queue just emptied — worth a brief "Saved". */
  justSaved: boolean;
  /** Something the server refused outright, and won't accept on a retry. */
  problem: string | null;
};

export const EMPTY_STATUS: OutboxStatus = {
  pending: { sets: 0, other: 0 },
  syncing: false,
  stuck: false,
  justSaved: false,
  problem: null,
};

let queue: OutboxEntry[] = [];
let loaded = false;
let flushing = false;
let syncing = false;
let justSaved = false;
let problem: string | null = null;
let savedTimer: ReturnType<typeof setTimeout> | null = null;

// Cached so `getStatus` returns a stable identity between changes — a new
// object every call makes useSyncExternalStore re-render forever.
let status: OutboxStatus = EMPTY_STATUS;
const listeners = new Set<() => void>();
const drainedCallbacks = new Set<() => void>();

function publish() {
  status = {
    pending: waiting(queue),
    syncing,
    stuck: queue.some((e) => e.attempts >= COMPLAIN_AFTER),
    justSaved,
    problem,
  };
  for (const l of listeners) l();
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function persist() {
  try {
    if (queue.length) localStorage.setItem(OUTBOX_KEY, serializeQueue(queue));
    else localStorage.removeItem(OUTBOX_KEY);
  } catch {
    // Blocked or out of quota. The in-memory queue still covers this run,
    // which is the case this was actually asked for.
  }
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    queue = parseQueue(localStorage.getItem(OUTBOX_KEY));
  } catch {
    queue = [];
  }
  if (queue.length) publish();
}

function commit(next: OutboxEntry[]) {
  queue = next;
  persist();
  publish();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getStatus = () => status;
export const getServerStatus = () => EMPTY_STATUS;

/** Register something to run each time the queue reaches empty. */
export function onDrained(callback: () => void) {
  drainedCallbacks.add(callback);
  return () => {
    drainedCallbacks.delete(callback);
  };
}

export function send(op: OutboxOp) {
  load();
  commit(enqueue(queue, op, { id: newId(), now: Date.now() }));
  void flush();
}

export async function flush() {
  load();
  if (flushing || queue.length === 0) return;
  flushing = true;
  syncing = true;
  publish();
  let appliedAnything = false;

  try {
    // Rounds, because logging carries on while this runs — anything added
    // mid-flush goes up without waiting for the next trigger. Capped so a
    // server that accepts one entry per call can't spin here forever.
    for (let round = 0; round < 5; round++) {
      const batch = queue;
      if (batch.length === 0) break;

      let result: OutboxResult;
      try {
        const res = await fetch("/api/outbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: batch }),
        });
        if (res.status === 401) {
          problem = "Signed out — sign in again to upload these sets.";
          break;
        }
        if (!res.ok) {
          // Reached the server and it failed wholesale. Count it against every
          // entry so the UI can eventually admit something is wrong, but keep
          // them all: nothing is ever dropped on a count.
          result = {
            applied: [],
            failed: batch.map((e) => ({ id: e.id, permanent: false, message: "Upload failed" })),
          };
        } else {
          result = (await res.json()) as OutboxResult;
        }
      } catch {
        // Never reached the server. Keep the queue exactly as it is and don't
        // count an attempt — being offline is not a failure here.
        break;
      }

      const { queue: next, dropped } = applyResult(queue, result);
      if (result.applied.length > 0) appliedAnything = true;
      if (dropped.length > 0) problem = dropped[0].message;
      commit(next);
      if (result.applied.length === 0) break; // no progress — stop trying now
    }
  } finally {
    flushing = false;
    syncing = false;
    publish();
  }

  if (appliedAnything && queue.length === 0) {
    problem = null;
    justSaved = true;
    publish();
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(() => {
      justSaved = false;
      publish();
    }, SAVED_MS);
    for (const cb of drainedCallbacks) cb();
  }
}

export function retry() {
  problem = null;
  publish();
  void flush();
}

// ---- triggers, installed once however many components are mounted
let mounted = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const kick = () => void flush();
const onVisible = () => {
  if (document.visibilityState === "visible") void flush();
};

export function startFlusher() {
  mounted += 1;
  if (mounted > 1) return () => stopFlusher();
  // `navigator.onLine` is only ever a hint about when to retry — it reports
  // true on a gym wifi that resolves nothing. The timer is what actually gets
  // the queue out.
  window.addEventListener("online", kick);
  document.addEventListener("visibilitychange", onVisible);
  timer = setInterval(kick, RETRY_MS);
  void flush();
  return () => stopFlusher();
}

function stopFlusher() {
  mounted = Math.max(0, mounted - 1);
  if (mounted > 0) return;
  window.removeEventListener("online", kick);
  document.removeEventListener("visibilitychange", onVisible);
  if (timer) clearInterval(timer);
  timer = null;
}
