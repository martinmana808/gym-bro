// Seeds the local PGlite dev database with a demo workout + history for the
// dev login user. Run while the dev server is STOPPED: `npm run seed:demo`.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const client = new PGlite("./.pglite");
const db = drizzle(client);
await migrate(db, { migrationsFolder: "./drizzle" });

const one = async (sql, params = []) => (await client.query(sql, params)).rows[0];

const user = await one(
  `insert into users (email, name) values ('dev@localhost', 'Dev User')
   on conflict (email) do update set name = excluded.name returning id`,
);

const existing = await one(`select id from workouts where user_id = $1 and name = 'Push Day (demo)'`, [
  user.id,
]);
if (existing) {
  console.log("Demo workout already seeded, nothing to do.");
  process.exit(0);
}

const workout = await one(
  `insert into workouts (user_id, name, default_rest_seconds) values ($1, 'Push Day (demo)', 90) returning id`,
  [user.id],
);

const addBlock = async (position) =>
  (await one(`insert into blocks (workout_id, position) values ($1, $2) returning id`, [workout.id, position])).id;

const addExercise = (blockId, position, cols) =>
  one(
    `insert into exercises (block_id, position, name, sets, measurement, rep_scheme, reps_min, reps_max, time_seconds, rest_override_seconds)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [blockId, position, ...cols],
  );

const b1 = await addBlock(0);
const bench = await addExercise(b1, 0, ["Barbell bench press", 4, "reps", "fixed", 8, null, null, 180]);
const b2 = await addBlock(1);
const incline = await addExercise(b2, 0, ["Incline dumbbell press", 3, "reps", "range", 10, 15, null, null]);
const fly = await addExercise(b2, 1, ["Cable fly", 3, "reps", "failure", null, null, null, null]);
const b3 = await addBlock(2);
const plank = await addExercise(b3, 0, ["Plank", 3, "time", null, null, null, 45, null]);

// One finished session last week, with logs.
const session = await one(
  `insert into sessions (workout_id, user_id, started_at, finished_at)
   values ($1, $2, now() - interval '7 days', now() - interval '7 days' + interval '52 minutes') returning id`,
  [workout.id, user.id],
);
const log = (exerciseId, setNumber, weight, reps, time) =>
  client.query(
    `insert into set_logs (session_id, exercise_id, set_number, weight_kg, reps, time_seconds)
     values ($1,$2,$3,$4,$5,$6)`,
    [session.id, exerciseId, setNumber, weight, reps, time],
  );
for (let s = 1; s <= 4; s++) await log(bench.id, s, 80, s === 4 ? 6 : 8, null);
for (let s = 1; s <= 3; s++) await log(incline.id, s, 28, 12 - s, null);
for (let s = 1; s <= 3; s++) await log(fly.id, s, 15, 15 - s * 2, null);
for (let s = 1; s <= 3; s++) await log(plank.id, s, null, null, 50 - s * 5);

console.log(`Seeded demo workout ${workout.id} with one finished session.`);
await client.close();
