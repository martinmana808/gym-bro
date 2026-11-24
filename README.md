# 🏋️ Gym Bro

Your workout routine, tracked set by set — a mobile-first replacement for the
gym spreadsheet. Define workouts (exercises, sets, reps, rest), run them at the
gym with a rest countdown and workout timer, and compare what you did against
what you planned, session by session.

## Features

- **Workout builder** — free-text exercises with a set count and a target:
  fixed reps, a rep range (10–15), to failure, or a duration (time exercises).
- **Supersets & trisets** — group 2–3 exercises into a block performed
  back-to-back with no rest in between; rest comes after each round.
- **Rest timer** — one default rest time per workout, overridable per exercise.
  A circular countdown runs after every set/round, with +30s and skip.
- **Session runner** — start a workout, log weight × reps (or seconds) per set,
  see your target and what you lifted last session, finish to stamp the total
  workout duration. Interrupted sessions can be resumed.
- **History** — the spreadsheet view, live: rows are exercises, columns are
  past sessions, cells are the sets you logged (`80×8 · 80×8 · 80×6`).
- **Rest-timer push notifications** — install it to your iPhone home screen and
  get buzzed when rest is up, even with the app closed. iOS can't schedule a
  local notification, so the server holds the timer and pushes when it elapses.
  Setup and the home-screen/widget options: [`docs/ios-home-screen.md`](docs/ios-home-screen.md).
- **Google login** via Auth.js, with a zero-config dev login for local use.

## Getting started (local)

```bash
npm install
npm run dev
```

That's it — no database to install. Locally the app uses
[PGlite](https://pglite.dev) (embedded Postgres stored in `./.pglite`),
migrated automatically on boot. Open http://localhost:3000 and use
**Dev login** (available outside production only).

Optional: `npm run seed:demo` (with the dev server stopped) seeds a demo
"Push Day" workout with one week of history for the dev user.

`.env.local` needs an `AUTH_SECRET` (one was generated at scaffold time;
create one with `openssl rand -base64 32` if missing).

## Google sign-in

1. Create an OAuth client at https://console.cloud.google.com/apis/credentials
   (type: Web application).
2. Add the redirect URI: `<your-origin>/api/auth/callback/google`
   (e.g. `http://localhost:3000/api/auth/callback/google`).
3. Set in `.env.local` (and in Vercel for production):

```
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
```

## Deploying to Vercel

1. Provision a Postgres database (Neon via the Vercel Marketplace works well)
   and set `DATABASE_URL`.
2. Set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
   For push, also generate a VAPID keypair (`npx web-push generate-vapid-keys`)
   and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
   Without them the notification card simply doesn't appear.
3. Apply the schema once: `DATABASE_URL=... npm run db:migrate`.
4. `vercel deploy` (or connect the repo).

The dev login is disabled automatically in production builds; only Google
sign-in is offered there.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server (PGlite, auto-migrated) |
| `npm test` | Unit tests for the domain logic (`src/lib`) |
| `npm run db:generate` | Generate a new SQL migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` (production) |
| `npm run seed:demo` | Seed demo data into the local PGlite db |
| `npm run lifedata -- --dry-run` | Print the Life data blocks for the last 8 closed days, writing nothing |

## Life data

A daily job writes one block per training day to `Gym-bro.md` in Martin's
Google Drive folder *Life data*, where every app he uses writes its own file
and a Claude session reads the folder to say how his week went.

A summary line on top, then everything the app holds for that day underneath.

```
2026-11-12 · workout: Pequeño Putarraco · day: Day 2 · at: 20:58 · duration: 57min · done: 88% · sets: 23/26 · reps: 262 · volume: 8,280kg · muscles: Espalda, Triceps · ended: 21:55
  - done: Remo alto · 3 sets · 27 reps · 1,958kg · target: 3 × 10 reps @ 45kg
    - set 1 · 72.5kg × 10 reps · 21:00
    - set 2 · 72.5kg × 10 reps · 21:04
    - set 3 · 72.5kg × 7 reps · 21:06
  - skipped exercise: Dominadas neutras (3 sets)
```

A detail line starts with two spaces and `- `, a sub-detail with four — the
format the whole *Life data* folder uses.

- Every set is a row of `set_logs` as it stands: weight in the unit it was
  logged in, the reps he actually did, `target hit` where the app saved that
  flag, the minute it was logged, and `not logged` for a planned set he never
  reached. Nothing is derived or guessed.
- `scripts/lifedata.mjs` reads the day's rows and appends. Pure parts are
  unit-tested in `scripts/lifedata.test.mjs`; the database is only ever read,
  inside a `read only` transaction.
- `volume:` is kilos only, matching the History screen: a machine measured in
  bricks has no honest kilo figure, so those sets add nothing to the total and
  their own line carries the setting instead (`load: 6 bricks`).
- `muscles:` is the divider above a group of exercises in the workout
  (`exercises.section_name` — "PIERNAS", "HOMBROS"), busiest first. It is his
  own word for the group, so nothing is translated or guessed. An exercise
  under no divider shows up as `unmapped: <name>`; give it one.
- A day runs 04:00–03:59 Buenos Aires, so a workout at 01:00 belongs to the
  day before. The job runs at **04:05**, writes yesterday, and re-checks the
  7 days before it — if a day's data has changed since, it appends a fresh
  block rather than editing the old one. The file is append-only; the last
  block for a date is the true one.
- `launchctl` job `com.martinmana.gym-bro.lifedata`, logging to
  `~/Library/Logs/gym-bro-lifedata.log`. Drive for desktop syncs the file up,
  so there is no Drive API and no credential.
- The connection string lives in `.env.lifedata` as `LIFEDATA_DATABASE_URL`.
  **Not** `DATABASE_URL`: `src/db/index.ts` switches to that Postgres the
  moment the variable exists, and `npm run dev` would then be editing
  production.

## How it's put together

- **Next.js App Router** — server components for reads, server actions
  (`src/app/actions.ts`) for all mutations, with per-user ownership checks.
- **Drizzle ORM** (`src/db/schema.ts`) — `workouts → blocks → exercises`
  for the plan; `sessions → set_logs` for what you actually did. Logs are
  upserted on `(session, exercise, set)` so re-logging a set replaces it.
- **Domain logic** (`src/lib/workout.ts`) — flattening a workout into the
  ordered runner steps (sets, supersets rounds, rest insertion) is pure and
  unit-tested.
- Design notes: `docs/superpowers/specs/2026-07-03-gym-bro-design.md`.
