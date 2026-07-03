# Gym Bro — Workout Tracker Design

**Date:** 2026-07-03
**Status:** Approved defaults (user was away; decisions below are reversible and flagged for review)

## Purpose

Replace a spreadsheet-based workout routine with a mobile-first web app. The
spreadsheet has: exercises + prescribed sets/reps on the left, and one column
per week where the user logs what they actually did. The app keeps that
mental model: **workout templates** (what to do) and **sessions** (what you
did, one per gym visit), viewable side by side.

## Decisions (made autonomously, user to confirm)

- **Per-set logging = weight × reps** for rep exercises, duration for time
  exercises. Weight is optional (bodyweight movements).
- **Stack:** Next.js App Router (v16) + TypeScript + Tailwind, deployed on
  Vercel. Server actions for mutations, server components for reads.
- **Database:** Postgres via Drizzle ORM. Local dev uses PGlite (embedded
  Postgres, zero setup); production uses any Postgres `DATABASE_URL`
  (Neon via Vercel Marketplace recommended). Same dialect, same schema.
- **Auth:** Auth.js (NextAuth v5), JWT sessions. Google provider when
  `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are set; a dev-only credentials
  login is available outside production so the app works before Google
  OAuth is configured.

## Domain model

- **users** — id, email (unique), name, image. Upserted on sign-in.
- **workouts** — id, userId, name, defaultRestSeconds, position, createdAt.
- **blocks** — id, workoutId, position. A block with 1 exercise is a normal
  exercise, 2 = superset, 3 = triset ("hyperset"). No rest between exercises
  inside a block; rest happens after each round of the block.
- **exercises** — id, blockId, position, name (free text), sets,
  measurement (`reps` | `time`),
  repScheme (`fixed` | `range` | `failure`, for reps),
  repsMin, repsMax (fixed uses repsMin only), timeSeconds (for time),
  restOverrideSeconds (nullable — overrides the workout default after this
  block's rounds).
- **sessions** — id, workoutId, userId, startedAt, finishedAt (nullable).
- **setLogs** — id, sessionId, exerciseId, setNumber, weightKg (nullable),
  reps (nullable), timeSeconds (nullable), createdAt.

## Flows

### Build a workout
`/workouts/new` and `/workouts/[id]/edit` share one client-side builder
form: workout name, default rest time, ordered list of blocks; each block
holds 1–3 exercises (add/remove converts single ⇄ superset ⇄ triset); each
exercise has name, sets, type + target, optional rest override. Saving
replaces the workout's blocks/exercises transactionally. Editing a template
does not touch past sessions (logs reference exercise ids; deleted exercises
cascade their logs — acceptable for v1, flagged as a known trade-off).

### Run a session
"Start workout" creates a session (startedAt = now) and opens the runner
(`/sessions/[id]`), a client component that walks a precomputed step list:
for each block, for each round 1..max(sets), one *log step* per exercise
(back-to-back inside supersets/trisets), then one *rest step* (block's rest
override or workout default) — no rest after the final round of the final
block. Log step: big weight/reps (or seconds) inputs, prefilled from the
target and the previous session's same set; saves via server action.
Rest step: countdown (mm:ss) with +30s and skip. Header shows elapsed
workout time. "Finish" stamps finishedAt and shows a summary (duration,
sets logged). Sessions can be finished early; unfinished sessions can be
resumed from the workout page.

### Review history
Workout detail page renders the spreadsheet view: rows = exercises (grouped
by block, with targets), columns = most recent sessions (date header), cell =
that session's logged sets ("60×12 · 60×10" or "45s · 40s").

## Non-goals (v1)

Offline/PWA, sharing, exercise library/autocomplete, charts, per-set rest
timers mid-superset, editing past logs (beyond re-logging during session).

## Testing

Pure logic (runner step sequencing, target/log formatting) lives in
`src/lib/` with unit tests. End-to-end: dev login → create workout → run
session → verify logs and history render.
