# Gym Bro — Programs, Days, Muscle Sections & Variations

**Date:** 2026-07-15
**Status:** Design for review

## Context

Today the app is flat: a **workout** is a list of exercises grouped into
supersets (blocks), and every session of that workout targets the same numbers.
The user's real training — captured in his periodized spreadsheet
(`2024 Clean Master 2 - Noviembre 24.csv`) — is richer in two ways the app
can't express:

1. **A program is a split of several days**, each day organized by muscle group,
   and each exercise sits in a superset or on its own.
2. **The same day is repeated for ~4 weeks with escalating targets** (baseline →
   + → ++ → back-off). Same exercises, different weights and reps each week.

This redesign gives the app that structure — **Program → Day → Muscle section →
Superset → Exercise**, plus **Variations** (the weeks) — and makes logging
against a week's targets fast.

## Plain-language overview (read this first)

- A **Program** is the whole plan, e.g. "2024 Clean Master". It holds several
  **Days**.
- A **Day** is one workout you train in a session (Day 1, Day 2, Day 3). Inside a
  day, exercises are grouped into **muscle sections** — "Pecs", "Biceps" — which
  are just labels to keep it tidy. Within a section, two or three exercises can be
  a **superset** (done back-to-back).
- A **Variation** is a named version of a day — "Week 1", "+", "Deload". It's a
  full copy of that day with its own target weights and reps. You make a new one
  by **copying an existing variation** and nudging numbers; you rarely touch the
  exercise list. A day always has at least one variation.
- You **train** by opening a day and picking a variation (it defaults to the one
  you did last). The targets pre-fill so you're mostly confirming.
- Fast logging: **OK** logs "hit the fixed target exactly" in one tap;
  **ranges** show tappable rep buttons (10 · 11 · 12); to-failure exercises show
  no suggestion.
- **History** stays the spreadsheet grid, each column labeled with its variation.
- **Import** bootstraps the base of a program from a CSV, and you can **download
  an `example.csv`** that shows the exact format.

## Goals

1. Model Program → Day → Muscle section → Superset → Exercise.
2. Variations: named, full-copy versions of a day; create-by-copy; a day has ≥1.
3. Per-exercise **target weight** (new — today weight lives only in logged sets)
   and target reps, per variation.
4. Training picks a day + variation (default = last used); targets pre-fill.
5. Fast entry: `OK` for fixed hits, tappable suggestions for ranges.
6. History grid labeled by variation; exercises aligned across variations.
7. Import bootstraps a program's base; downloadable `example.csv`.
8. Migrate existing workouts/sessions into the new model with no data loss.

## Non-goals (YAGNI)

- **Program progress tracking** ("you're on Week 3, Day 2 next", auto-advance):
  not now. You pick the day and variation yourself.
- **Sections doing anything functional** (extra rest between muscle groups):
  they are labels only.
- **Cross-day week sync** (Day 1's "Week 1" being formally the same program-week
  as Day 2's): variations are per-day labels; no program-wide week object.
- **Base-structure propagation across variations**: because each variation owns
  its exercises, editing one doesn't ripple to the others. Create-by-copy makes
  this a fair trade (confirmed with user).
- Importing all weeks: import creates the **base only** (first variation);
  further variations are made in-app by copying.

## The model

### Hierarchy

```
Program            "2024 Clean Master"
└─ Day             "Day 1"  (what you train in one session)
   └─ Variation    "Week 1" (a full copy of the day with its own targets)
      └─ Exercise  (flat, ordered list; grouping done by two labels below)
```

**Muscle sections and supersets are expressed as grouping keys on the flat
exercise list, not as separate nesting tables** — sections are "just labels" and
supersets are small runs, so this keeps the model light and copy-friendly:

- `sectionName` (nullable): consecutive exercises sharing the same non-null
  `sectionName` render under one muscle header ("Pecs"). `null` = no section.
- `supersetKey` (nullable): consecutive exercises sharing the same `supersetKey`
  form a superset/triset (2–3), performed back-to-back. Distinct/`null` =
  standalone. This replaces today's `blocks` table.

### What a Variation owns vs. shares

A variation is a **full, independent copy** of the day's structure: its own
ordered exercises, each with setup (name, sets, unit, section, superset) **and
targets** (target weight, rep scheme, reps/time). Nothing is shared between
variations at the row level. Because new variations are created by copying, they
start identical; the user typically edits only numbers, but may add/drop/swap an
exercise for a single variation.

**Lineage for history alignment:** each exercise carries a `lineageId`. When a
variation is copied, every exercise keeps its source's `lineageId`. The history
grid groups rows by `lineageId`, so "Bench press in Week 1" and "Bench press in
Week 3" share a row even though they are different DB rows. A genuinely new
exercise in one variation gets a fresh `lineageId` and shows blanks in the
variations that lack it.

### Targets

Per exercise, per variation:
- `targetWeight` (nullable number) — the planned weight (his "Peso"). `null` =
  bodyweight / "Sp".
- `weightUnit` — `kg` | `bricks` (existing).
- `repScheme` — `fixed` | `range` | `failure` (existing) | plus **`time`** stays
  via `measurement`.
- `repsMin` / `repsMax` — fixed uses `repsMin`; range uses both; failure uses
  neither; time uses `timeSeconds`.

The runner pre-fills weight from `targetWeight` (falling back to the last logged
weight for that lineage if the target is null), and reps from the target.

### Sessions and logging

- A **session** belongs to a `dayId` + `variationId` (and user). Start → pick the
  variation (default: the variation of your most recent session for that day).
- **Set log** gains a `hitTarget` boolean (the `OK`): when true it means "did the
  fixed target exactly"; `reps` is snapshotted to the target value so math and
  export stay concrete, while the UI shows `OK`. `hitTarget` is only settable for
  `fixed` exercises.

## Surfaces

### Builder (authoring)

- **Program screen:** name the program; ordered list of its days; add/rename/
  reorder/remove days.
- **Day builder:** edit the day's exercises grouped into **muscle sections**
  (add a section with a name; add exercises to it; mark 2–3 as a superset). Each
  exercise: name, sets, unit, rep scheme + reps/time, **target weight**, note.
- **Variations bar (within a day):** list of variations; **"Add variation"
  duplicates the currently open one** and asks for a name; switch between
  variations to edit their numbers; rename/delete (can't delete the last one).
- Editing a variation edits only that variation's copy.

### Runner (training)

- Enter from a day → variation picker (default last-used) → run.
- Same guided flow as today (step per set, rest timer, grid overlay), plus:
  - Target chip shows the variation's target (weight × reps / range / failure).
  - Weight/reps pre-filled from target.
  - **`OK` button** for `fixed` exercises: one tap logs the set at the target and
    marks `hitTarget`.
  - **Range quick-taps:** for `range`, render buttons for each value
    `repsMin..repsMax` (e.g. 10 · 11 · 12); tap fills + logs. Still overridable by
    typing or the +/- ticker. No suggestions for `failure`.

### History

- Keep the current spreadsheet grid (one column per session). Each column header
  shows date, duration (already added), **and the variation label**.
- Rows are aligned by `lineageId`; muscle-section headers group the rows;
  supersets keep their accent (from the recent superset-marking work).

### Import + example.csv

- `/import` bootstraps a **program's base**: parses one program file into a
  Program → Days → (sections, supersets, exercises) → **one variation** ("Week 1"
  / a default name) with its target weights and reps. Additional weeks are made
  in-app by copying.
- **A `Download example.csv` button** on the import screen provides the canonical
  template. The canonical format is explicit (no guessing):
  - A `Day: <name>` row starts a day; a `Section: <muscle>` row starts a section.
  - Exercise rows: `name, sets, unit(kg|bricks), scheme(fixed|range|failure),
    reps or min-max, target_weight, superset_group, note`.
  - `superset_group`: same label on consecutive rows = a superset.
  - **Bodyweight** is expressed by leaving `target_weight` blank (there is no
    third unit); `unit` still records kg vs. bricks for when weight is added.
  - This is a clean authoring format; it does NOT try to reproduce the dense
    `8888` / `(68)` session-cell notation (that was for reading his old sheet;
    going forward, logging happens in the app).
- The explicit canonical format **replaces** the current lenient parser
  (`src/lib/import.ts`); the old dense-sheet tokens (`Sp`, `40/15`, `(N)`, `+N`,
  bricks variants) survive only as a one-page "reading your old sheet" note, not
  as supported input. `example.csv` teaches the canonical format only.

## Schema changes

New/changed tables (Drizzle; PGlite dev / Postgres prod):

- `programs(id, user_id→users, name, created_at)`
- `days(id, program_id→programs cascade, position, name, default_rest_seconds)`
- `variations(id, day_id→days cascade, position, name, created_at)`
- `exercises` — repointed to a variation and flattened:
  `(id, variation_id→variations cascade, position, lineage_id, section_name?,
  superset_key?, name, sets, measurement, weight_unit, rep_scheme, reps_min?,
  reps_max?, time_seconds?, rest_override_seconds?, target_weight?, note?)`
  (drops `block_id`; the `blocks` table is removed.)
- `sessions(id, day_id→days, variation_id→variations, user_id, started_at,
  finished_at)` (was `workout_id`).
- `set_logs(… , hit_target boolean not null default false)` (adds the OK flag;
  `exercise_id` now points at a variation's exercise row).
- `session_notes` unchanged in shape (keyed by session + exercise).
- `workouts` and `blocks` tables are removed after migration.

### Migration of existing data

Each existing `workout` maps to: a **Program** (same name) containing **one Day**
(same name) containing **one Variation** ("Base"). The workout's blocks/exercises
flatten into that variation's exercise list — `supersetKey` derived from the old
`block_id` (exercises sharing a block get the same key), `sectionName` = null,
`lineageId` = a fresh id per exercise, `targetWeight` = null. Existing `sessions`
re-point to the new `day_id` + the "Base" `variation_id`; `set_logs` and
`session_notes` carry over unchanged (their `exercise_id` values are preserved
because exercise rows keep their ids through the migration). This preserves all
logged history.

## Error handling

- Deleting the last variation of a day is blocked (a day needs ≥1).
- Import validates the file into the preview before any write; the whole import
  runs in a transaction (as the current importer now does).
- Feature-detected UI (wake lock, audio) unchanged.

## Testing

- Unit: lineage alignment for the history grid; superset/section grouping from
  the flat list; target pre-fill fallback; OK snapshotting; range quick-tap value
  generation; the new import parser (day/section/superset/target parsing) and the
  `example.csv` round-trip (parse(example) === expected).
- Migration test: a fixture DB in the old shape migrates to the new shape with
  sessions/logs intact.
- Manual: build a program with 2 days, muscle sections, a superset; add Week 2 by
  copying Week 1 and bumping weights; train Week 2 using OK and range quick-taps;
  confirm history shows both weeks aligned; import the example; download the
  example.

## Phased build order (each usable on its own)

1. **Model + migration:** new tables, migrate existing data, read paths. App
   still behaves as before (one program/day/variation per old workout).
2. **Variations:** the variations bar, create-by-copy, variation picker in the
   runner (default last-used), variation label in history.
3. **Sections + target weight:** muscle-section authoring/display, per-exercise
   target weight, target-driven pre-fill.
4. **Fast entry:** OK button + `hit_target`, range quick-taps.
5. **Import redesign + example.csv:** explicit canonical format, downloadable
   template, transactional commit.

Each phase gets its own implementation plan.
