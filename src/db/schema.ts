import {
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { WeightUnit } from "@/lib/workout";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workouts = pgTable("workouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  defaultRestSeconds: integer("default_rest_seconds").notNull().default(90),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A block groups 1-3 exercises performed back-to-back without rest:
// 1 = plain exercise, 2 = superset, 3 = triset.
export const blocks = pgTable("blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workoutId: uuid("workout_id")
    .notNull()
    .references(() => workouts.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
});

export type Measurement = "reps" | "time";
export type RepScheme = "fixed" | "range" | "failure";

export const exercises = pgTable("exercises", {
  id: uuid("id").primaryKey().defaultRandom(),
  blockId: uuid("block_id")
    .notNull()
    .references(() => blocks.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  sets: integer("sets").notNull(),
  measurement: text("measurement").$type<Measurement>().notNull(),
  repScheme: text("rep_scheme").$type<RepScheme>(),
  repsMin: integer("reps_min"),
  repsMax: integer("reps_max"),
  timeSeconds: integer("time_seconds"),
  restOverrideSeconds: integer("rest_override_seconds"),
  note: text("note"),
  weightUnit: text("weight_unit").$type<WeightUnit>().notNull().default("kg"),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workoutId: uuid("workout_id")
    .notNull()
    .references(() => workouts.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const setLogs = pgTable(
  "set_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    setNumber: integer("set_number").notNull(),
    // Column keeps its historical name; the number is in the exercise's weightUnit.
    weight: real("weight_kg"),
    reps: integer("reps"),
    timeSeconds: integer("time_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("set_logs_unique_set").on(t.sessionId, t.exerciseId, t.setNumber)],
);

// One optional free-text note per exercise per session ("felt weak", "machine taken").
export const sessionNotes = pgTable(
  "session_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    note: text("note").notNull(),
  },
  (t) => [uniqueIndex("session_notes_unique").on(t.sessionId, t.exerciseId)],
);

export type Workout = typeof workouts.$inferSelect;
export type Block = typeof blocks.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SetLog = typeof setLogs.$inferSelect;
export type SessionNote = typeof sessionNotes.$inferSelect;
