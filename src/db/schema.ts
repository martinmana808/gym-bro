import {
  boolean,
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

export const programs = pgTable("programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const days = pgTable("days", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: uuid("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  defaultRestSeconds: integer("default_rest_seconds").notNull().default(90),
});

export const variations = pgTable("variations", {
  id: uuid("id").primaryKey().defaultRandom(),
  dayId: uuid("day_id")
    .notNull()
    .references(() => days.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Measurement = "reps" | "time";
export type RepScheme = "fixed" | "range" | "failure";

export const exercises = pgTable("exercises", {
  id: uuid("id").primaryKey().defaultRandom(),
  variationId: uuid("variation_id")
    .notNull()
    .references(() => variations.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  lineageId: uuid("lineage_id").notNull(),
  sectionName: text("section_name"),
  supersetKey: text("superset_key"),
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
  targetWeight: real("target_weight"),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  dayId: uuid("day_id")
    .notNull()
    .references(() => days.id, { onDelete: "cascade" }),
  variationId: uuid("variation_id")
    .notNull()
    .references(() => variations.id, { onDelete: "cascade" }),
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
    hitTarget: boolean("hit_target").notNull().default(false),
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

export type Program = typeof programs.$inferSelect;
export type Day = typeof days.$inferSelect;
export type Variation = typeof variations.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SetLog = typeof setLogs.$inferSelect;
export type SessionNote = typeof sessionNotes.$inferSelect;

// Compat shapes the query layer synthesizes so the existing UI is unchanged.
// A "workout" in the UI is a Day + its Base variation; a "block" is a run of
// exercises sharing a superset_key.
export type Workout = {
  id: string; // = day.id
  programId: string;
  userId: string;
  name: string;
  defaultRestSeconds: number;
  createdAt: Date;
};
export type Block = { id: string; position: number };
