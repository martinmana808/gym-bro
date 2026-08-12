# Active session bar — design

**Date:** 2026-08-12
**Status:** approved

## Problem

Once a session is running, nothing outside the session page says so. Opening
the workout hub shows a "Resume session in progress" button, but the workouts
list, spreadsheet view and every other page look identical whether or not you
are mid-workout. Between sets you leave the session page to check something and
lose the thread.

The reference is Spotify's now-playing bar: always visible, shows what's
happening, one tap back to the full view.

## Behaviour

A bar pinned to the bottom of every page **except** the session runner
(`/sessions/[id]` while unfinished) and `/signin`. Three states:

```
working   ▎Day 1 · Pequeño Putarraco                       lime
          ▎Press plano · set 2/3                      ›

resting   ▎Day 1 · resting                                 sky
          ▎Next: Flexiones de brazos          1:12    ›

done      ▎Day 1 · all sets logged                         amber
          ▎Tap to finish                              ›
```

Tapping anywhere on the bar opens the session.

Top line is `<day> · <program>`. When the program has more than one week the
week is included — `Day 1 · Week 2 · Pequeño Putarraco` — since that is what
distinguishes sessions once weeks exist. It truncates rather than wraps.

Colours reuse the existing language: lime for active, sky for rest (matching
the rest screen), amber for "everything logged, go finish" (matching the
Resume button).

## Rest state

New nullable column `sessions.rest_ends_at`.

Rest start writes it; skip rest, finishing, discarding and jumping to another
set clear it. This is what lets the countdown survive navigation, reload and
closing the app — and it fixes existing behaviour where reloading the session
page silently drops the rest timer.

The session page already calls `POST /api/push/rest` when rest starts. That
route becomes `POST /api/session/rest` and does both jobs: persist the rest end
time and schedule the push. One call, one concept ("rest started"), so the bar
does not depend on the push feature being configured.

`SessionRunner` seeds its `resting` state from `session.restEndsAt`, so the
countdown is restored on reload.

## Data

`getActiveSession(userId)` returns the most recently started unfinished
session, or null:

```ts
{
  sessionId, programId, dayId,
  programName, dayName, weekName, weekCount,
  restEndsAtMs: number | null,
  steps: { exerciseName, setNumber, rounds }[],   // ordered set steps
  loggedKeys: string[],                            // "exerciseId#setNumber"
}
```

The current exercise is derived with the same `buildSteps` logic the session
runner uses to pick its resume point, so the bar and the page cannot disagree.

## Wiring

The bar must tick, so it is a client component. It is rendered once in the root
layout and fetches `GET /api/active-session`:

- on mount
- when the pathname changes
- when the app regains focus (`visibilitychange`)

Fetching client-side rather than passing server props avoids the stale-layout
problem: App Router does not re-render the root layout on client navigation, so
server-fetched props would not notice a session starting or finishing.

The component renders nothing when there is no active session or when the path
is `/sessions/*` or `/signin`. It also renders a spacer in normal flow matching
its own height, so no page's content hides behind it. Existing pages need no
changes.

## Pure logic

`src/lib/activeSession.ts`:

```ts
activeSessionView(input, nowMs) ->
  { mode: "working" | "resting" | "done",
    primary: string,      // exercise name, or "Tap to finish"
    detail: string,       // "set 2/3", "Next: …", ""
    secondsLeft: number | null }
```

Unit-tested with vitest like `buildSteps` and `restPush`.

## Edge cases

- `rest_ends_at` already in the past on load → working state, no negative
  countdown.
- Countdown reaches zero while on another page → bar flips to working on its
  own (client tick, no refetch needed).
- More than one unfinished session → most recently started wins.
- Session finished or discarded → endpoint returns null, bar disappears on the
  next fetch trigger.

## Testing

1. vitest over `activeSessionView` — all three modes, boundary at zero seconds,
   empty/complete logs.
2. Browser pass: start a session, navigate to the workouts list and hub,
   confirm the bar appears and links back; confirm it is absent on the session
   page; confirm it disappears after finishing.
