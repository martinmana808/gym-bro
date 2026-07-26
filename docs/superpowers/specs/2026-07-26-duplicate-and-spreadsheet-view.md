# Duplicate workout + "Spreadsheet classic" view

**Date:** 2026-07-26
**Status:** Approved design (user confirmed: duplicate = plan only; sheet = read-only)

## Motivation

The user runs a workout for a month (4 weeks), then starts the next month from a
copy of the same plan ("Clean Master August" → "Clean Master September"). And
because the data really is a spreadsheet, they want to see the whole workout —
plan + every logged session — laid out exactly like their sheet.

## Feature 1: Duplicate a workout (plan only)

**`duplicateProgram(programId)`** clones a program's **plan** into a new program:
all days (name, position, rest), all weeks (variations: name, position), and all
exercises (every field). It does **not** copy sessions or set logs — the new
month starts with empty history. New name: `"<name> copy"` (≤ 80 chars).
Redirects to the new workout's hub.

- Lineage and superset grouping are preserved *within the copy*: build an
  old→new map for `lineageId` and for `supersetKey`, reused across all inserted
  exercises, so the copy's weeks stay lineage-aligned and its supersets stay
  grouped — but the copy shares no ids with the original.

**`renameProgram(programId, name)`** sets the program name (≤ 80, non-empty),
so the duplicate can be renamed to next month's name. Revalidates the hub + list.

**Hub UI:** the workout hub (`/workouts/[id]`) gains:
- an inline **rename** control on the title (pencil → text field → save), and
- a **Duplicate** button (alongside the existing "Delete workout").

Monthly flow: finish August → **Duplicate** → **rename** to September → train.

## Feature 2: "Spreadsheet view" (read-only full history)

A separate page **`/workouts/[id]/sheet`**, linked from the hub, that renders the
whole workout like the source spreadsheet:

```
DAY 1
              │        Week 1          │        Week 2          │ …
 Exercise     │ Target │ 6 Nov │ 10 Nov │ Target │ 17 Nov │ 21 Nov │
 ── PECHO ──  (green section divider row)
 Press plano  │ 40×15  │ 15·15·15·12 │ OK·OK·6 │ 45 │ … │ … │
 Inclinado    │ 30×10  │ …           │ …       │ 35 │ … │ … │
 ── BICEPS ──
 …
DAY 2
 …
```

- **One section per day**, all days stacked on one page; each day is a wide table
  that scrolls horizontally (weeks add columns).
- **Columns:** a leading "Exercise" column, then for each **week** a group of
  `[Target, <one column per finished session of that week>]`. Session columns are
  headed by the session date (links to that session). Weeks are ragged — each
  week shows only its own sessions.
- **Rows:** exercises grouped under green muscle-section divider rows (matching
  the plan's styling). The same exercise spans all weeks on one row.
- **Cells:** Target = `formatTarget` + `formatTargetWeight`; session cell =
  `formatSessionCell` (the existing dense "OK·OK·6" formatter). Empty where a
  week lacks that exercise or a session lacks logs.
- **Read-only.** Editing a plan stays in the day editor; logging stays in the
  runner.

### Query: `getProgramSheet(programId, userId)`

Returns, per day: the ordered weeks, the finished sessions per week (with date
labels), the exercise **rows** (matched across weeks), and each cell's target +
session strings. Matching the "same" exercise across weeks: key by `lineageId`,
falling back to `name` when lineages differ (UI-added weeks use fresh lineage).
Row order follows first appearance scanning weeks in order; section comes from
the exercise's `sectionName`.

Ownership via `program.userId`. Reuses `formatTarget`, `formatTargetWeight`,
`formatSessionCell` from `src/lib/workout.ts`.

## Non-goals

- No inline editing in the sheet (read-only).
- Duplicate never copies sessions/logs.
- No CSV re-export changes (separate existing feature).
- No pagination — a month of data is small enough to render whole.

## Edge cases

- A day/week with no sessions → its week group shows just the Target column.
- An exercise present in some weeks but not others → blank cells for the missing
  weeks (row still spans, keyed by lineage/name).
- Program with one week / one day → a single small table (still valid).
- Duplicate of a program mid-session (unfinished session) → fine; sessions aren't
  copied anyway.

## Testing

- **Unit:** a pure `buildSheetRows(weeks)` helper (match/align exercises across
  weeks into ordered rows) — aligned grid, ragged grid (exercise missing from a
  week), lineage vs name fallback.
- **Integration (deployed):** on the seeded "2024 Clean Master 2", open
  Spreadsheet view → every day shows weeks as column groups with targets and the
  real session logs; then Duplicate it → renamed copy has the same plan and empty
  history; delete the copy.

## Rollout

Build subagent-driven, commit per task, deploy, verify on the seeded program.
