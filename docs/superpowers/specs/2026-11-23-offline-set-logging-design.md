# Offline set logging

**Date:** 2026-11-23
**Status:** approved in conversation, building

## Intent

Log sets, skips and notes in a gym with no signal, and have them land in the
real database once there is signal again. Today the app refuses: `submitSet`
awaits the `logSet` server action and, when it throws, shows "check your
connection" and will not advance to the next set. A dead zone stops the
workout dead.

The why, in the user's words: *"be able to log sets/reps etc without internet
connection, and then when connection gets resumed, it gets uploaded to the live
db"*.

## Goals

- Tapping **Log set** advances immediately, signal or not.
- Sets, skips, unskips, notes and **Finish** survive with no network, and upload
  by themselves when it returns.
- Writes survive the app being killed — they are on disk, not in memory. Even
  though the *screen* still needs the network (see non-goals), the data is not
  lost.
- A quiet, honest status: how many writes are waiting, and when they have
  landed.
- Replaying a write twice must be harmless.

## Non-goals

- **Loading the app offline.** The session page is `force-dynamic` and `sw.js`
  has no fetch handler, deliberately. Reopening the PWA with no signal still
  gives a browser error page. The user has never hit this ("the second one never
  happened to me yet"), so it stays out of scope. The outbox means nothing is
  *lost* when it does happen — only hidden until signal returns.
- **Starting a workout offline.** `startSession` inserts and redirects.
- **Discarding a session offline.** Queuing a delete is dangerous: discard
  offline, log more sets, and the replayed delete eats them. Stays online-only.
- **A local database with two-way sync.** The heavy-duty version. Weeks of work,
  and the failure modes are subtle. Not for a problem not yet had.

## Anti-goals

Things that would make this a failure even if it technically worked:

- A set that looks logged on the phone but silently never reaches the database.
- Pretending to be offline-capable while quietly dropping writes after N tries.
- Two code paths — one online, one offline — that drift apart.
- A spinner or a red banner on the one screen used mid-set, between heavy lifts.

## Constraints

- **iOS PWA.** Background Sync is unsupported on iOS Safari, so the browser
  cannot retry for us. Retrying is the app's job, while it is open.
- **`localStorage` is synchronous**, which is a feature here: the write lands
  before iOS can kill the app. IndexedDB's async commit can be lost mid-flight.
- **`navigator.onLine` lies** (true on a captive portal). It is a hint about
  *when to retry*, never a gate on whether to try.
- **Replay safety already exists.** `set_logs` has a unique index on
  `(session_id, exercise_id, set_number)`; `logSet` upserts, `skipSets` does
  `onConflictDoNothing`, `unskipSets` is a delete, `saveSessionNote` upserts.
  All idempotent. Order between them still matters and must be preserved.
- **The rest countdown already works offline** — `startRest` sets local state
  first and `startRestOnServer` swallows its own errors. Correcting an earlier
  claim of mine: no work needed there. Only the *push* (for a backgrounded
  phone) needs the network, and a push could not be delivered offline anyway.

## Approaches

1. **Browser Background Sync.** The platform retries, even with the app closed.
   Rejected: Apple does not implement it. Same reason the rest alarm is bounced
   off the server.
2. **A local Postgres (PGlite) in the browser, synced to Neon.** Proper
   offline-first, and would fix the non-goals too. Rejected: weeks of work, and
   two-way sync goes wrong in hard-to-debug ways.
3. **Optimistic UI plus a durable outbox — chosen.** The phone records the write
   and moves on; a flusher drains the queue whenever it can.

## Design

### One path, not two

Every session write goes through the outbox, online and offline alike. Enqueue
is synchronous, so the UI moves instantly; the flush fires immediately after.
With signal it completes in ~100ms and the status line never appears. This is
the point: there is no separate offline code path to rot.

### The queue

`localStorage`, one key `sharp.outbox.v1`, holding an ordered array of:

```ts
{ id: string; queuedAt: number; attempts: number; op: Op }
```

`Op` is one of `log`, `skip`, `unskip`, `note`, `finish`, each carrying exactly
the arguments its existing server action takes.

**Strict FIFO.** Order carries meaning: log → skip → log on the same set must
end up logged. Flush serially, stop at the first failure, keep the rest.

**Coalescing.** Enqueuing a `log` for a set that already has a pending `log`
drops the earlier one (same for `note` per exercise). Both are whole-row
upserts, so the later fully subsumes the earlier, and the replay result is
identical with or without the intervening ops.

### Draining

`POST /api/outbox` takes the batch and returns which entries applied and which
failed, with a `permanent` flag. A route handler rather than a server action,
because HTTP status codes are how we tell *network down* (fetch throws, keep
everything, retry) from *server said no* (4xx, drop that entry and say so out
loud). It also means one round trip instead of one per set.

Triggers: on mount, on `online`, on `visibilitychange` → visible, after every
enqueue, and every 15s while the queue is non-empty.

Auth and ownership are checked once per batch. Each op is applied by the same
function the matching server action calls — extracted to `src/db/sessionWrites.ts`
so there is a single implementation, not a copy.

### `finish` offline

`finishSession` currently stamps `new Date()` on the server, so a workout
finished at 19:40 and flushed at 21:00 would record 21:00 and an 80-minute
duration. The op therefore carries the client's `finishedAtMs`, clamped
server-side to `[startedAt, now]`, falling back to `now` if it is nonsense.

Pressing Finish with no signal queues the op and shows a local confirmation
rather than navigating — the summary page cannot render offline. `router.refresh()`
happens when the queue drains.

### What the user sees

A single quiet line under the controls:

- queue empty, nothing to say → nothing
- `3 sets waiting to upload` while the queue is non-empty
- `Saved` for a moment once it drains
- a real red error only for a `permanent` failure, which means something is
  genuinely wrong and retrying will not fix it

The "Saving…" button text and the `saving` disabled state go away. The step
advancing *is* the feedback.

## Files

| File | Change |
|---|---|
| `src/lib/outbox.ts` | new — pure queue: enqueue, coalesce, serialize, drop |
| `src/lib/outbox.test.ts` | new — vitest, including the log→skip→log case |
| `src/lib/useOutbox.ts` | new — persistence, flush loop, triggers, status |
| `src/db/sessionWrites.ts` | new — the DB work, shared by actions and route |
| `src/app/api/outbox/route.ts` | new — batch drain |
| `src/app/actions.ts` | `logSet`/`skipSets`/`unskipSets`/`saveSessionNote`/`finishSession` delegate to `sessionWrites`; `finishSession` accepts `finishedAtMs` |
| `src/components/SessionRunner.tsx` | writes go through the outbox; optimistic `submitSet`; status line; offline-aware finish |

No schema change, so no migration.

## Left to the builder

- Exact wording and placement of the status line.
- Retry interval and the attempt cap before an entry is called permanent.
- Whether the status line also appears in the bottom session widget (default: no,
  keep it on the session screen).
