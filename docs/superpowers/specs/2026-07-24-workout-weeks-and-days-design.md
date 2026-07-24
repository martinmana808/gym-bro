# Workout = Weeks × Days grid

**Date:** 2026-07-24
**Status:** Approved design (user: "GOOD GO AHEAD YOLO")

## The problem

Today the app flattens the hierarchy. A "workout" in the UI is really a single
**Day**, and the **Program** that groups days is invisible — a 3-day plan shows
up as 3 unrelated workouts. But a real workout is a whole plan you don't do in
one sitting: you go to the gym and train **one day** of it (Push, or Pull, or
Legs). And the same day repeats **week after week** with heavier targets.

So a Workout is a **grid**:

```
WORKOUT: Upper/Lower
              Week 1     Week 2     Week 3     ( + Week )
  Day 1 ·    (cell)     (cell)     (cell)
  Upper
  Day 2 ·    (cell)     (cell)     (cell)
  Lower
```

- **Days** (down the side) = which session you train today. The unit of one gym
  visit. Shared across every week.
- **Weeks** (across the top) = where you are in the progression. The same day
  comes back each week, heavier.
- A **cell** = (Day, Week) = the exercise list for that day in that week,
  organized by muscle-group dividers and supersets (unchanged from today).
- You train standing in one cell: "Day 1, Week 2."

## Key property: no schema migration

The database already has `programs → days → variations → exercises`, with
`sessions(dayId, variationId)`. Variations are stored **per day** today. Rather
than migrate variations up to the program level (which would mean backfilling
columns, remapping every session, and dropping a foreign key — risking the
user's logged history), we keep the tables exactly as they are and add one
**invariant** enforced in code:

> **Within a workout, every day has the same ordered set of week positions
> (0, 1, 2, …), and a week's label is program-global.**

Then:

- **"Week N" of a workout** = the position-`N` variation of every one of its
  days, viewed together (a column of the grid).
- **A cell (Day, Week N)** = that day's variation at position `N` — a real
  `variations` row with its `exercises`. Editing a cell is the existing
  `updateVariation`. Training a cell is the existing `startSession(dayId,
  variationId)`. **Sessions and history keep working untouched.**

All mutations (add day, add week, delete) go through helpers that maintain the
invariant, so the grid stays rectangular.

## Terminology (UI ↔ storage)

| UI term  | Storage            | Notes                                            |
|----------|--------------------|--------------------------------------------------|
| Workout  | `programs` row     | Top-level plan. UI label is "Workout".           |
| Day      | `days` row         | Session unit. `days.programId`, `days.position`. |
| Week     | aligned `variations.position` across the workout's days | Program-global column. Label synced across the aligned per-day variations. |
| Cell     | one `variations` row (a day's variation at a week position) + its `exercises` | Muscle dividers + supersets live here (already built). |
| Session  | `sessions(dayId, variationId)` | Training one Day in one Week. **Unchanged.** |

## Screens & routes

Route tree changes so the **Workout (program)** is the hub. Day IDs still key
the training/edit/history pages.

- **`/workouts`** — list of **Workouts** (programs): name, day count, last
  trained, and a "resume session" badge if one is unfinished. Tap → workout hub.
  Replaces today's flattened list.
- **`/workouts/new`** — create a Workout (name only). Creates the program +
  "Day 1" + "Week 1" with one empty exercise block. Lands on the hub.
- **`/workouts/[programId]`** — **Workout hub.**
  - Week tabs across the top: `Week 1 · Week 2 · … · + Week`. Default selected
    week = the latest week (highest position), or the week of the most recent
    session if there is one.
  - Under the selected week, the list of **Days** (in order). Each day row:
    name, a short exercise/muscle summary, and **Train** + **Edit** actions,
    and the row links to the day's detail/history. Resume badge if that day has
    an unfinished session.
  - Manage controls: **+ Add day**, rename/reorder/delete a day; rename/delete
    the selected week; **+ Week** (copy current week forward).
- **`/workouts/[programId]/days/[dayId]`** — **Day detail**: the plan for the
  currently-selected week + the spreadsheet **history grid** for that day (its
  sessions as columns, each column tagged with the week it belonged to). This is
  today's day page, re-homed under the program.
- **`/workouts/[programId]/days/[dayId]/edit?week=W`** — edit that **cell** via
  the existing `WorkoutBuilder`, saving through `updateVariation` on the day's
  position-`W` variation. Week tabs let you switch which week you're editing.
- **`/sessions/[id]`** — unchanged.
- **`/import`** — unchanged in behavior (already builds a multi-day program);
  after import it lands on the new workout hub.

Old deep links (`/workouts/[dayId]`, `/workouts/[dayId]/edit`) are personal-app
internal; they are replaced, not preserved.

## Actions (server)

New or changed. All authorize via the `program.userId` chain.

- **`createWorkout(name)`** → program + `Day 1` (position 0) + `Week 1`
  (position 0) + one empty block. Returns to `/workouts/[programId]`.
  *(Changed: today it takes a full `WorkoutInput`; now it's name-only and you
  build the first cell on the edit page.)*
- **`addDay(programId, name)`** → new day at `position = dayCount`, and for
  **every existing week position** create an empty variation (label copied from
  that week) so the new day is a full column-height. Returns to the hub.
- **`renameDay(dayId, name)`**, **`deleteDay(dayId)`** (cascade removes its
  variations/exercises/sessions — confirm in UI), **`moveDay(dayId, dir)`**
  (swap `position` with neighbor).
- **`addWeek(programId, sourceWeekPos)`** → for **each day**, copy its
  `sourceWeekPos` variation (exercises included, fresh `lineageId` continuity as
  today's `createVariation`) to `position = weekCount`. Program-global label
  `Week {weekCount+1}`. Returns to the hub on the new week.
- **`renameWeek(programId, weekPos, name)`** → set `name` on every day's
  variation at `weekPos` (keeps the label program-global).
- **`deleteWeek(programId, weekPos)`** → delete every day's variation at
  `weekPos`, then reindex remaining week positions to stay contiguous. Refuse to
  delete the last remaining week. Confirm in UI (drops that week's sessions).
- **`updateVariation(variationId, WorkoutInput)`** — **unchanged** (edits a
  cell).
- **`startSession(dayId, variationId)`** — **unchanged**.

## Query layer

- **`listWorkouts(userId)`** → one row per **program**: `{ id, name, dayCount,
  lastFinishedAt, unfinishedSessionId }`. (Today it returns one row per day.)
- **`getWorkout(programId, userId)`** → `{ program, days, weeks }` where `weeks`
  is the derived column list `[{ position, name }]` (distinct positions across
  the program's days, label from the lowest-day's variation, ordered). Plus, for
  a given selected week, each day's cell variation id + a small block/exercise
  summary for the hub.
- **`getDayCell(dayId, weekPos, userId)`** → the `variationId` at that position
  for that day (for edit/train), or null.
- **`getVariationStructure`**, **`getWorkoutHistory`**, **`getSessionData`**,
  **`getUnfinishedSession`** — reused; history is still per-day. History columns
  gain a small week tag (from `sessions.variationId` → its week position).

### Pure helpers (unit-tested, in `src/lib/`)

Keep the invariant logic pure and tested:

- **`deriveWeeks(variationsByDay)`** → the ordered program-global week list from
  each day's variations (align by `position`; label = first day's name at that
  position; the max position count defines the number of weeks).
- **`isRectangular(variationsByDay)`** / **`missingCells(variationsByDay)`** →
  which (day, position) cells are absent, so a normalize step can fill them.

## Normalization (defensive, insert-only)

Existing data is almost certainly already rectangular (manual workouts are one
day with one week; imports are N days each with one "Week 1"). To be safe
against any historical mismatch, when the hub loads a workout we ensure it is
rectangular: for any `(day, position)` with no variation, insert an **empty**
variation at that position with the week's label. **Only inserts, never
deletes** — so it can never lose data, and it is idempotent. New workouts and
all mutations already keep the grid rectangular, so this is a backstop.

## Non-goals

- No change to the exercise editor (dividers, supersets, shared sets, number
  pickers) — cells are edited exactly as today.
- No change to the session runner or set logging.
- No calendar/scheduling ("which day is Monday") — you pick the day you train.
- No cross-day "whole week done" tracking — a session is still one day.
- No reordering of weeks (only add at the end / delete). Days can reorder.

## Edge cases

- **Delete the last day** of a workout → deletes the workout (as `deleteWorkout`
  does today with the last day). Confirm.
- **Delete the last week** → refused (a workout always has ≥1 week).
- **Add a day** to a multi-week workout → the new day gets an empty cell in
  every week, trainable immediately.
- **A day with an unfinished session** → still shows a resume badge in the hub;
  deleting weeks/days that own an unfinished session is allowed after confirm.
- **History across weeks** → a day's history grid shows all its sessions
  regardless of week, each column tagged with its week label, oldest→newest.

## Testing

- **Unit:** `deriveWeeks`, `isRectangular`/`missingCells` — rectangular grids,
  ragged grids, single day, single week.
- **Integration (deployed):** create a Workout → it has Day 1 / Week 1 → add
  "Day 2" → add "Week 2" (copies both days forward) → edit the (Day 1, Week 2)
  cell → train it → confirm the session logs, the history grid shows the week
  tag, and the grid stays rectangular. Reopen and confirm everything round-trips.

## Rollout

Build subagent-driven, commit per task, deploy to Vercel (`vercel deploy
--prod`). Verify live on the phone URL.
