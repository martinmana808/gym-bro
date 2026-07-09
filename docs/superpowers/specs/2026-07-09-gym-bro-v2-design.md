# Gym Bro v2 — Notes, Grid, History, Import

**Date:** 2026-07-09
**Status:** Approved design, pending implementation

## Context

Gym Bro replaces the user's workout spreadsheet. The current app already covers the
core loop: start a session, log weight×reps set by set with a rest timer, finish to
stamp the duration; workouts support superset/triset blocks, rep schemes
(fixed / range / to-failure), and time-based exercises; history renders one column
per session like the sheet.

The user's spreadsheet was shared to convey *how they think*, not as a feature list
to clone. Brainstorming identified what the app still needs to genuinely replace it.

## Goals

1. Notes at two levels: persistent per exercise, and per exercise per session.
2. Whole-day grid view in the live runner (jump to any set, no forced sequence).
3. Edit sets of finished sessions.
4. Dense, sheet-style history cells (reps sequence; weight shown only on change).
5. Weight unit per exercise: kilograms or bricks (machine stack plates).
6. In-app spreadsheet import with preview and ambiguity review.
7. Screen wake lock during sessions; vibration + beep when rest ends.
8. CSV export of all data.

## Non-goals

- Shared exercise identity across workouts (Day 1 / Day 2 shoulder blocks stay
  independent — explicit user decision).
- Grid-first redesign: the guided runner stays the default gym experience.
- Progress charts and PR highlights — **later**, recorded in "Future" below.
- Import deduplication: importing the same sheet twice creates duplicates; the
  preview step is the safeguard.

## Data model changes

All changes are additive except one rename. Migrations via drizzle-kit.

- `exercises.note` — `text`, nullable. Persistent setup note ("+ barbell",
  "use the cable pulley"). Edited in the workout builder.
- `exercises.weight_unit` — `text` enum `'kg' | 'bricks'`, not null, default `'kg'`.
- New table `session_notes`:
  - `id` (pk), `session_id` (fk → sessions, cascade delete),
    `exercise_id` (fk → exercises, cascade delete), `note` text not null.
  - Unique on (`session_id`, `exercise_id`). Upsert semantics like `set_logs`.
- Rename `set_logs.weight_kg` → `set_logs.weight` (column + TS property `weightKg`
  → `weight`). The number is interpreted in the exercise's `weightUnit`. Mechanical
  rename across queries, actions, runner, formatters.

## Features

### 1. Notes

- **Runner**: the exercise card shows `exercise.note` under the exercise name
  (muted, small). An "Add note for today" affordance opens a small input that
  upserts `session_notes` via a new `saveSessionNote` server action; existing
  today-note is shown and editable.
- **Builder**: optional "Note" text input per exercise (persisted on save).
- **History table**: cells whose (session, exercise) has a note get a `*` marker;
  the note text appears in the finished-session summary under that exercise.
- **Session summary**: shows session notes beneath each exercise's logged sets.

### 2. Set grid (shared component)

`SetGrid` — client component. Rows = exercises in block order (block label shown
for supersets/trisets); columns = set 1…maxSets. Cell content: `72×8` (kg),
`20br×8` (bricks), `45s` (time), or empty. Horizontally scrollable on phones.

Used in two modes:

- **Live session (runner grid toggle)**: a grid icon in the runner header opens the
  grid as an overlay. Tapping a cell **jumps the runner to that set** and closes
  the overlay — the runner is already the editor (it pre-fills logged values and
  re-submitting upserts), so no new write path. This replaces hunting via
  Previous/Skip; those buttons stay.
- **Finished session (edit mode)**: the summary page gets an "Edit sets" toggle
  that swaps the read-only list for the grid. Tapping a cell opens a bottom-sheet
  editor (same steppers as the runner) that saves through the existing `logSet`
  upsert. `logSet` already accepts writes to any owned session, finished or not.

### 3. Dense history (workout detail)

- New **Weight** column after Target: the exercise's current working weight = the
  most recently logged weight for it, formatted with its unit ("72 kg", "20 br").
- Session cells use the sheet convention via a pure formatter in `lib/workout.ts`:
  - Reps joined with `·`: `8·8·8·6`.
  - When a set's weight differs from the previous set in the same session, insert
    the new weight in parens before it: `8·8 (70) 8·6`. For the first set, parens
    appear only if its weight differs from the row's Weight column value.
  - Time-based exercises: `45s·45s·40s`.
  - Bricks format inside parens as `(20br)`.
- Formatter signature: `formatSessionCell(logs: LoggedSet[], unit: WeightUnit,
  currentWeight: number | null): string`. Unit-tested.

### 4. Weight units in the runner

- Weight stepper label follows the unit: "Weight (kg)" / "Weight (bricks)".
- Stepper increment: 2.5 for kg, 1 for bricks. Decimal input allowed for kg only.

### 5. Spreadsheet import

- New authed page `/import`, linked from the workouts page.
- Input: textarea for cells pasted straight from Google Sheets (TSV) or a CSV file
  upload (both feed the same parser).
- **Parser** (`src/lib/import.ts`, pure, unit-tested) understands the user's layout:
  - A row whose first cell matches `Day N` (or any non-empty title row followed by
    a `Sets`/`Weight` header row) starts a new workout named after that cell.
  - Header row provides date columns: `dd.mm` → session dates. Year inference:
    current year, rolled back one year if the resulting date is in the future.
  - Exercise rows: name, sets count, weight cell, then one cell per session.
  - Consecutive exercise rows where the Sets cell is empty (spreadsheet merged
    cells) join the previous exercise's block → superset/triset.
  - Weight cell: leading number = working weight; `plate`/`pulley`/`brick` tokens
    set `weightUnit: bricks`; `FAIL` sets rep scheme to-failure; `N reps min` sets
    `repsMin = N` (fixed scheme); `Bodyweight` → weight null; anything else unparsed lands in
    `exercise.note`.
  - Session cells: digit strings segmented into `sets` rep values (`8888` → 8,8,8,8;
    `12131313` → 12,13,13,13). `(N)` mid-cell = weight change for subsequent sets.
    Parens with non-numeric content (`(40Pulley)` → weight 40 + note, `(20plate)`)
    become weight changes and/or session notes.
  - Segmentation: if digit count == sets → all 1-digit; == 2×sets → all 2-digit;
    otherwise enumerate segmentations, prefer reps 1–30 and consistent with the
    cell's neighbors; multiple plausible readings → cell flagged **ambiguous**.
- **Preview screen** (client): parsed workouts/exercises/sessions rendered as
  tables. Ambiguous or unparsable cells highlighted with an inline editor
  (comma-separated reps). Nothing is written until "Import" is pressed.
- **Commit** (`importSpreadsheet` server action): creates workouts, blocks,
  exercises, sessions (`startedAt` = parsed date at 12:00 local,
  `finishedAt = startedAt`), set logs, and session notes, all owned by the user.
- Sessions with zero duration render "—" instead of "0:00" in summary and history.

### 6. Gym usability

- **Wake lock**: while an unfinished session is mounted, request
  `navigator.wakeLock('screen')`; re-acquire on `visibilitychange`; release on
  unmount/finish. Feature-detected; silent no-op where unsupported.
- **Rest-end alert**: when the rest countdown crosses zero, `navigator.vibrate`
  (where supported) + a short WebAudio beep. The `AudioContext` is created/resumed
  on the first "Log set" tap (user-gesture requirement, esp. iOS).

### 7. CSV export

- Route handler `GET /api/export` (authed): streams a CSV of all the user's logged
  data — workout, exercise, session date, set number, weight, unit, reps, seconds,
  exercise note, session note. Linked from the workouts page ("Export CSV").

## Error handling

- Import: parse errors and ambiguities never throw — they surface as flagged cells
  in the preview; the commit action validates ownership and re-checks payload
  shapes (same sanitize approach as `createWorkout`).
- Wake lock / vibration / audio: feature-detect, fail silently.
- Set edits reuse existing error surfaces (inline error text, retry).

## Testing

- Unit (vitest): `formatSessionCell` (grouping, weight change parens, first-set
  rule, bricks, time-based); import parser (day/block/superset detection, date
  inference, weight-cell tokens, rep segmentation incl. ambiguous cases, parens
  handling); existing `buildSteps` tests stay green.
- Manual: full flow on the dev server — build workout with notes + brick exercise,
  run session with grid jumps and rest buzz, finish, edit a past set, import a
  sheet sample, export CSV.

## Future (explicitly deferred)

- Per-exercise progress charts (weight over time).
- PR detection and highlights.
- Import deduplication / re-import merge.

## Implementation phases (for the plan)

1. Schema + rename migration; notes plumbing (builder, runner, summary).
2. Weight units end-to-end (builder, runner, formatters).
3. Dense history formatter + Weight column + `*` markers.
4. `SetGrid` + runner overlay + finished-session edit mode.
5. Wake lock + rest-end alert.
6. Import parser + `/import` page + commit action.
7. CSV export.
