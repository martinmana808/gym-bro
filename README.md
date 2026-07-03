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
