/**
 * The outbox: session writes recorded on the phone, uploaded when there's
 * signal. Gyms are concrete boxes, and before this the app would refuse the
 * set and refuse to move on, which ends the workout.
 *
 * Everything here is pure, so the ordering rules — the part that quietly
 * corrupts a session if it's wrong — can be tested without a browser. The
 * storage, the retry loop and the DOM events live in `useOutbox`.
 *
 * Replay is safe by construction, not by bookkeeping: `set_logs` has a unique
 * index on (session, exercise, set number), `log` upserts it, `skip` leaves an
 * existing row alone, `unskip` deletes only skipped rows and `note` upserts.
 * Sending the same op twice lands the same state. What *isn't* free is order,
 * so this is a strict queue and the flusher drains it one at a time.
 */

export type OutboxOp =
  | {
      kind: "log";
      sessionId: string;
      exerciseId: string;
      setNumber: number;
      weight: number | null;
      reps: number | null;
      timeSeconds: number | null;
      hitTarget: boolean;
    }
  | { kind: "skip"; sessionId: string; sets: { exerciseId: string; setNumber: number }[] }
  | { kind: "unskip"; sessionId: string; exerciseId?: string }
  | { kind: "note"; sessionId: string; exerciseId: string; note: string }
  | { kind: "finish"; sessionId: string; finishedAtMs: number };

export type OutboxEntry = {
  id: string;
  /** When the phone recorded it — not when it was uploaded. */
  queuedAt: number;
  /** Server-side failures only. A dead network never counts as an attempt. */
  attempts: number;
  op: OutboxOp;
};

export type OutboxFailure = { id: string; permanent: boolean; message: string };
export type OutboxResult = { applied: string[]; failed: OutboxFailure[] };

export const OUTBOX_KEY = "sharp.outbox.v1";

/** How many failed attempts before we stop saying "waiting" and admit a problem. */
export const COMPLAIN_AFTER = 5;

const setKey = (sessionId: string, exerciseId: string, setNumber: number) =>
  `${sessionId}#${exerciseId}#${setNumber}`;

/**
 * Add a write to the back of the queue.
 *
 * Coalescing only ever drops an op that a later one makes irrelevant, and only
 * where the replayed result is identical either way:
 *
 *  - a `log` for a set with one already pending: the later one overwrites every
 *    column, so the earlier is dead weight. Anything in between (a skip, say)
 *    stays put, because a skip against an already-logged row does nothing and
 *    against a missing one gets overwritten a moment later. Same end state.
 *  - a `note` for the same exercise, and a `finish` for the same session: both
 *    whole-value upserts, same reasoning.
 *  - pending `skip`s swept away by an `unskip` that covers them. Undoing a skip
 *    that hasn't uploaded yet shouldn't upload it first and then delete it.
 *    The `unskip` itself is kept: earlier skips may already be in the database.
 */
export function enqueue(
  queue: readonly OutboxEntry[],
  op: OutboxOp,
  meta: { id: string; now: number },
): OutboxEntry[] {
  let kept = [...queue];

  if (op.kind === "log") {
    const key = setKey(op.sessionId, op.exerciseId, op.setNumber);
    kept = kept.filter(
      (e) =>
        !(e.op.kind === "log" && setKey(e.op.sessionId, e.op.exerciseId, e.op.setNumber) === key),
    );
  } else if (op.kind === "note") {
    kept = kept.filter(
      (e) =>
        !(
          e.op.kind === "note" &&
          e.op.sessionId === op.sessionId &&
          e.op.exerciseId === op.exerciseId
        ),
    );
  } else if (op.kind === "finish") {
    kept = kept.filter(
      (e) => !(e.op.kind === "finish" && e.op.sessionId === op.sessionId),
    );
  } else if (op.kind === "unskip") {
    const exerciseId = op.exerciseId;
    kept = kept.flatMap((e) => {
      if (e.op.kind !== "skip" || e.op.sessionId !== op.sessionId) return [e];
      // Undoing one exercise leaves the other exercises' pending skips behind.
      const sets = exerciseId ? e.op.sets.filter((s) => s.exerciseId !== exerciseId) : [];
      if (sets.length === 0) return [];
      return [{ ...e, op: { ...e.op, sets } }];
    });
  }

  return [...kept, { id: meta.id, queuedAt: meta.now, attempts: 0, op }];
}

/**
 * Fold the server's answer back into the queue. An entry leaves the queue only
 * when it was applied, or when the server said it can never be applied —
 * never because it has failed a certain number of times. A set lost because the
 * database had a bad minute is the exact failure this feature exists to stop.
 */
export function applyResult(
  queue: readonly OutboxEntry[],
  result: OutboxResult,
): { queue: OutboxEntry[]; dropped: OutboxFailure[] } {
  const applied = new Set(result.applied);
  const failed = new Map(result.failed.map((f) => [f.id, f]));
  const dropped = result.failed.filter((f) => f.permanent && queue.some((e) => e.id === f.id));

  const next = queue
    .filter((e) => !applied.has(e.id) && !(failed.get(e.id)?.permanent ?? false))
    .map((e) => (failed.has(e.id) ? { ...e, attempts: e.attempts + 1 } : e));

  return { queue: next, dropped };
}

const isOp = (v: unknown): v is OutboxOp => {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.sessionId !== "string") return false;
  switch (o.kind) {
    case "log":
      return typeof o.exerciseId === "string" && typeof o.setNumber === "number";
    case "skip":
      return Array.isArray(o.sets);
    case "unskip":
      return o.exerciseId === undefined || typeof o.exerciseId === "string";
    case "note":
      return typeof o.exerciseId === "string" && typeof o.note === "string";
    case "finish":
      return typeof o.finishedAtMs === "number";
    default:
      return false;
  }
};

const isEntry = (v: unknown): v is OutboxEntry => {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.queuedAt === "number" &&
    typeof e.attempts === "number" &&
    isOp(e.op)
  );
};

/**
 * Read the queue back out of storage. Anything unrecognisable is discarded
 * rather than thrown: this runs on every load of the session screen, and a
 * half-written entry must not be able to stop the app from starting.
 */
export function parseQueue(raw: string | null): OutboxEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}

export const serializeQueue = (queue: readonly OutboxEntry[]) => JSON.stringify(queue);

/** What's outstanding, split so the status line can use the right noun. */
export function waiting(queue: readonly OutboxEntry[]): { sets: number; other: number } {
  let sets = 0;
  let other = 0;
  for (const { op } of queue) {
    if (op.kind === "log") sets += 1;
    else if (op.kind === "skip") sets += op.sets.length;
    else other += 1;
  }
  return { sets, other };
}
