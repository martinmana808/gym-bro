# Changelog

## v1.0.0 — 2026-08-13

First version used for real training, day in and day out.

### Planning
- Workouts as a **Days × Weeks** grid: a program has days, each day has a
  variation per week. Weeks are aligned positions, not copies of a plan.
- Exercises with a set count and a target: fixed reps, a rep range, to failure,
  or a duration. Weight in kg or machine "bricks".
- **Supersets and trisets** — 2–3 exercises performed back to back, rest after
  each round.
- Muscle-group sections (Pecho, Biceps, …) within a day.
- Later weeks open a **numbers-only editor**: same exercises, prefilled
  sets/weight/reps. The first week owns the exercise list.
- CSV import for a whole program, CSV export of every logged set.

### Training
- Session runner: one set at a time, pre-filled with the plan's target, wheel
  pickers for weight and reps, per-exercise notes for the day.
- Sets that match the plan are marked as hit automatically.
- Rest countdown with +30s and skip, screen wake lock, beep and vibration.
- **Rest-timer push notifications** — the server holds the timer, so a
  backgrounded PWA on iOS still gets buzzed when rest is up.
- **Pause / resume** a session; paused time is excluded from the duration.
- **Session widget** on every page: current exercise, target, superset
  position, live rest countdown, progress bar. One tap back into the workout.
- All-sets grid to jump to any set.

### History
- Spreadsheet view: rows are exercises, columns are past sessions.
- Per-day history table with targets and what was actually lifted.

### Platform
- Installable PWA, iOS safe-area aware, dark only.
- Google sign-in, plus a dev login for local use.
- Next.js App Router on Vercel, Drizzle over Postgres (PGlite locally).
