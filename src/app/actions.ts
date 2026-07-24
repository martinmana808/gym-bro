"use server";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/auth";
import { getDb, schema } from "@/db";
import type { Measurement, RepScheme } from "@/db/schema";
import type { WeightUnit } from "@/lib/workout";
import { deriveWeeks } from "@/lib/weeks";

export type ExerciseInput = {
  id?: string;
  name: string;
  sets: number;
  measurement: Measurement;
  repScheme: RepScheme | null;
  repsMin: number | null;
  repsMax: number | null;
  timeSeconds: number | null;
  restOverrideSeconds: number | null;
  note: string | null;
  weightUnit: WeightUnit;
  targetWeight?: number | null;
};

export type BlockInput = { id?: string; sectionName?: string | null; exercises: ExerciseInput[] };

export type WorkoutInput = {
  name: string;
  defaultRestSeconds: number;
  blocks: BlockInput[];
};

function sanitizeWorkout(input: WorkoutInput): WorkoutInput {
  const int = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const blocks = input.blocks
    .map((b) => ({
      id: b.id,
      sectionName: b.sectionName?.trim() ? b.sectionName.trim().slice(0, 40) : null,
      exercises: b.exercises
        .filter((e) => e.name.trim().length > 0)
        .slice(0, 3)
        .map((e) => ({
          id: e.id,
          name: e.name.trim(),
          sets: int(e.sets, 1, 20, 3),
          measurement: e.measurement === "time" ? ("time" as const) : ("reps" as const),
          repScheme:
            e.measurement === "time"
              ? null
              : e.repScheme === "range" || e.repScheme === "failure"
                ? e.repScheme
                : ("fixed" as const),
          repsMin: e.measurement === "reps" && e.repScheme !== "failure" ? int(e.repsMin, 1, 999, 10) : null,
          repsMax: e.measurement === "reps" && e.repScheme === "range" ? int(e.repsMax, 1, 999, 15) : null,
          timeSeconds: e.measurement === "time" ? int(e.timeSeconds, 1, 36000, 30) : null,
          restOverrideSeconds:
            e.restOverrideSeconds == null || `${e.restOverrideSeconds}` === ""
              ? null
              : int(e.restOverrideSeconds, 0, 3600, 0),
          note: e.note?.trim() ? e.note.trim().slice(0, 500) : null,
          weightUnit: e.weightUnit === "bricks" ? ("bricks" as const) : ("kg" as const),
          targetWeight:
            e.targetWeight == null || `${e.targetWeight}` === ""
              ? null
              : Number.isFinite(Number(e.targetWeight))
                ? Math.max(0, Number(e.targetWeight))
                : null,
        })),
    }))
    .filter((b) => b.exercises.length > 0);
  return {
    name: input.name.trim() || "Untitled workout",
    defaultRestSeconds: int(input.defaultRestSeconds, 0, 3600, 90),
    blocks,
  };
}

/** Flatten builder blocks into exercise rows for one variation: one shared
 * superset_key per block, day-global position, fresh lineage. */
function flattenBlockExercises(blocks: BlockInput[], variationId: string) {
  const rows: (typeof schema.exercises.$inferInsert)[] = [];
  blocks.forEach((block, i) => {
    const supersetKey = crypto.randomUUID();
    block.exercises.forEach((e, j) => {
      rows.push({
        variationId,
        position: i * 1000 + j,
        lineageId: crypto.randomUUID(),
        sectionName: block.sectionName ?? null,
        supersetKey,
        name: e.name,
        sets: e.sets,
        measurement: e.measurement,
        repScheme: e.repScheme,
        repsMin: e.repsMin,
        repsMax: e.repsMax,
        timeSeconds: e.timeSeconds,
        restOverrideSeconds: e.restOverrideSeconds,
        note: e.note,
        weightUnit: e.weightUnit,
        targetWeight: e.targetWeight ?? null,
      });
    });
  });
  return rows;
}

export async function createWorkout(input: WorkoutInput) {
  const userId = await requireUserId();
  const db = await getDb();
  const data = sanitizeWorkout(input);
  let programId = "";
  await db.transaction(async (tx) => {
    const [program] = await tx
      .insert(schema.programs)
      .values({ userId, name: data.name })
      .returning({ id: schema.programs.id });
    programId = program.id;
    const [day] = await tx
      .insert(schema.days)
      .values({ programId: program.id, position: 0, name: "Day 1", defaultRestSeconds: data.defaultRestSeconds })
      .returning({ id: schema.days.id });
    const [variation] = await tx
      .insert(schema.variations)
      .values({ dayId: day.id, position: 0, name: "Week 1" })
      .returning({ id: schema.variations.id });
    const rows = flattenBlockExercises(data.blocks, variation.id);
    if (rows.length) await tx.insert(schema.exercises).values(rows);
  });
  revalidatePath("/workouts");
  redirect(`/workouts/${programId}`);
}

/** Verify the day belongs to the user; return it (with programId). */
async function ownedDay(dayId: string, userId: string) {
  const db = await getDb();
  const day = await db.query.days.findFirst({ where: eq(schema.days.id, dayId) });
  if (!day) throw new Error("Workout not found");
  const program = await db.query.programs.findFirst({
    where: and(eq(schema.programs.id, day.programId), eq(schema.programs.userId, userId)),
  });
  if (!program) throw new Error("Workout not found");
  return day;
}

/** Verify the variation belongs to the user (via its day/program); return it. */
async function ownedVariation(variationId: string, userId: string) {
  const db = await getDb();
  const v = await db.query.variations.findFirst({ where: eq(schema.variations.id, variationId) });
  if (!v) throw new Error("Variation not found");
  await ownedDay(v.dayId, userId); // throws if not owned
  return v;
}

/** Verify the program belongs to the user; return it. */
async function ownedProgram(programId: string, userId: string) {
  const db = await getDb();
  const p = await db.query.programs.findFirst({
    where: and(eq(schema.programs.id, programId), eq(schema.programs.userId, userId)),
  });
  if (!p) throw new Error("Workout not found");
  return p;
}

/**
 * Update-in-place: exercises whose ids are echoed back are updated (preserving
 * their set-log history), missing ones are deleted, new ones inserted. Blocks
 * are re-keyed each save (grouping is cosmetic; exercise identity is what
 * carries history).
 */
export async function updateVariation(variationId: string, input: WorkoutInput) {
  const userId = await requireUserId();
  const variation = await ownedVariation(variationId, userId);
  const dayId = variation.dayId;
  const db = await getDb();
  const data = sanitizeWorkout(input);

  await db
    .update(schema.days)
    .set({ name: data.name, defaultRestSeconds: data.defaultRestSeconds })
    .where(eq(schema.days.id, dayId));

  const existing = await db.query.exercises.findMany({
    where: eq(schema.exercises.variationId, variationId),
  });
  const existingIds = new Set(existing.map((e) => e.id));
  const keptIds = new Set(
    data.blocks
      .flatMap((b) => b.exercises.map((e) => e.id))
      .filter((id): id is string => !!id && existingIds.has(id)),
  );
  const dropIds = [...existingIds].filter((id) => !keptIds.has(id));
  if (dropIds.length) await db.delete(schema.exercises).where(inArray(schema.exercises.id, dropIds));

  for (const [i, block] of data.blocks.entries()) {
    const supersetKey = crypto.randomUUID();
    for (const [j, e] of block.exercises.entries()) {
      const common = {
        position: i * 1000 + j,
        sectionName: block.sectionName ?? null,
        supersetKey,
        name: e.name,
        sets: e.sets,
        measurement: e.measurement,
        repScheme: e.repScheme,
        repsMin: e.repsMin,
        repsMax: e.repsMax,
        timeSeconds: e.timeSeconds,
        restOverrideSeconds: e.restOverrideSeconds,
        note: e.note,
        weightUnit: e.weightUnit,
        targetWeight: e.targetWeight ?? null,
      };
      if (e.id && keptIds.has(e.id)) {
        await db.update(schema.exercises).set(common).where(eq(schema.exercises.id, e.id));
      } else {
        await db.insert(schema.exercises).values({
          ...common,
          variationId,
          lineageId: crypto.randomUUID(),
        });
      }
    }
  }

  const day = await db.query.days.findFirst({ where: eq(schema.days.id, dayId) });
  revalidatePath("/workouts");
  revalidatePath(`/workouts/${day!.programId}`);
  redirect(`/workouts/${day!.programId}/days/${dayId}?week=${variation.position}`);
}

export async function startSession(dayId: string, variationId?: string) {
  const userId = await requireUserId();
  await ownedDay(dayId, userId);
  const db = await getDb();
  let vId = variationId;
  if (vId) {
    const v = await ownedVariation(vId, userId);
    if (v.dayId !== dayId) throw new Error("Variation does not belong to this day");
  } else {
    // Default: the most recently used variation for this day, else the first.
    const lastSession = await db.query.sessions.findFirst({
      where: eq(schema.sessions.dayId, dayId),
      orderBy: desc(schema.sessions.startedAt),
    });
    vId =
      lastSession?.variationId ??
      (await db.query.variations.findFirst({
        where: eq(schema.variations.dayId, dayId),
        orderBy: asc(schema.variations.position),
      }))?.id;
    if (!vId) throw new Error("Day has no variation");
  }
  const [session] = await db
    .insert(schema.sessions)
    .values({ dayId, variationId: vId, userId })
    .returning({ id: schema.sessions.id });
  redirect(`/sessions/${session.id}`);
}

async function ownedSession(sessionId: string, userId: string) {
  const db = await getDb();
  const session = await db.query.sessions.findFirst({
    where: and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)),
  });
  if (!session) throw new Error("Session not found");
  return session;
}

export type LogSetInput = {
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  timeSeconds: number | null;
  hitTarget?: boolean;
};

export async function logSet(input: LogSetInput) {
  const userId = await requireUserId();
  const session = await ownedSession(input.sessionId, userId);
  const db = await getDb();
  const values = {
    sessionId: session.id,
    exerciseId: input.exerciseId,
    setNumber: input.setNumber,
    weight: input.weight,
    reps: input.reps,
    timeSeconds: input.timeSeconds,
    hitTarget: input.hitTarget ?? false,
  };
  await db
    .insert(schema.setLogs)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.setLogs.sessionId, schema.setLogs.exerciseId, schema.setLogs.setNumber],
      set: {
        weight: values.weight,
        reps: values.reps,
        timeSeconds: values.timeSeconds,
        hitTarget: values.hitTarget,
      },
    });
}

export async function saveSessionNote(input: {
  sessionId: string;
  exerciseId: string;
  note: string;
}) {
  const userId = await requireUserId();
  const session = await ownedSession(input.sessionId, userId);
  const db = await getDb();
  const note = input.note.trim().slice(0, 500);
  if (!note) {
    await db
      .delete(schema.sessionNotes)
      .where(
        and(
          eq(schema.sessionNotes.sessionId, session.id),
          eq(schema.sessionNotes.exerciseId, input.exerciseId),
        ),
      );
    return;
  }
  await db
    .insert(schema.sessionNotes)
    .values({ sessionId: session.id, exerciseId: input.exerciseId, note })
    .onConflictDoUpdate({
      target: [schema.sessionNotes.sessionId, schema.sessionNotes.exerciseId],
      set: { note },
    });
}

export async function finishSession(sessionId: string) {
  const userId = await requireUserId();
  const session = await ownedSession(sessionId, userId);
  const db = await getDb();
  if (!session.finishedAt) {
    await db
      .update(schema.sessions)
      .set({ finishedAt: new Date() })
      .where(eq(schema.sessions.id, sessionId));
  }
  const day = await db.query.days.findFirst({ where: eq(schema.days.id, session.dayId) });
  revalidatePath(`/workouts/${day!.programId}/days/${session.dayId}`);
  revalidatePath("/workouts");
}

export async function deleteSession(sessionId: string) {
  const userId = await requireUserId();
  const session = await ownedSession(sessionId, userId);
  const db = await getDb();
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
  const day = await db.query.days.findFirst({ where: eq(schema.days.id, session.dayId) });
  revalidatePath(`/workouts/${day!.programId}/days/${session.dayId}`);
  redirect(`/workouts/${day!.programId}/days/${session.dayId}`);
}

export type ImportProgramExercise = {
  name: string;
  sets: number;
  weightUnit: WeightUnit;
  repScheme: RepScheme;
  repsMin: number | null;
  repsMax: number | null;
  targetWeight: number | null;
  supersetGroup: string | null;
  sectionName: string | null;
  note: string | null;
};
export type ImportProgramDay = { name: string; exercises: ImportProgramExercise[] };

export async function importProgram(programName: string, days: ImportProgramDay[]) {
  const userId = await requireUserId();
  // Nothing to import (e.g. a direct call with an empty parse) — don't create an orphan program.
  if (!days.some((d) => d.exercises.some((e) => e.name.trim()))) redirect("/import");
  const db = await getDb();
  let programId = "";
  await db.transaction(async (tx) => {
    const [program] = await tx
      .insert(schema.programs)
      .values({ userId, name: programName.trim().slice(0, 80) || "Imported program" })
      .returning({ id: schema.programs.id });
    programId = program.id;
    for (const [di, d] of days.entries()) {
      const [day] = await tx
        .insert(schema.days)
        .values({ programId: program.id, position: di, name: d.name.trim().slice(0, 80) || `Day ${di + 1}`, defaultRestSeconds: 90 })
        .returning({ id: schema.days.id });
      const [variation] = await tx
        .insert(schema.variations)
        .values({ dayId: day.id, position: 0, name: "Week 1" })
        .returning({ id: schema.variations.id });
      let prevGroup: string | null = null;
      let key = crypto.randomUUID();
      const rows = d.exercises
        .filter((e) => e.name.trim())
        .map((e, i) => {
          const sameBlock = i > 0 && e.supersetGroup != null && e.supersetGroup === prevGroup;
          if (!sameBlock) key = crypto.randomUUID();
          prevGroup = e.supersetGroup;
          const sets = Math.min(20, Math.max(1, Math.round(e.sets) || 1));
          return {
            variationId: variation.id,
            position: i,
            lineageId: crypto.randomUUID(),
            sectionName: e.sectionName?.trim().slice(0, 40) || null,
            supersetKey: key,
            name: e.name.trim().slice(0, 120),
            sets,
            measurement: "reps" as const,
            repScheme: e.repScheme,
            repsMin: e.repScheme === "failure" ? null : Math.min(999, Math.max(1, Math.round(e.repsMin ?? 10))),
            repsMax: e.repScheme === "range" ? Math.min(999, Math.max(1, Math.round(e.repsMax ?? 15))) : null,
            timeSeconds: null,
            restOverrideSeconds: null,
            note: e.note?.trim().slice(0, 500) || null,
            weightUnit: e.weightUnit === "bricks" ? ("bricks" as const) : ("kg" as const),
            targetWeight: e.targetWeight == null ? null : Math.max(0, e.targetWeight),
          };
        });
      if (rows.length) await tx.insert(schema.exercises).values(rows);
    }
  });
  revalidatePath("/workouts");
  redirect(programId ? `/workouts/${programId}` : "/workouts");
}

/** Add a day to a workout. The new day gets an (empty) cell for every existing
 * week so it is trainable in each. */
export async function addDay(programId: string) {
  const userId = await requireUserId();
  await ownedProgram(programId, userId);
  const db = await getDb();
  const days = await db.query.days.findMany({
    where: eq(schema.days.programId, programId),
    orderBy: asc(schema.days.position),
  });
  const allVars = days.length
    ? await db.query.variations.findMany({
        where: inArray(schema.variations.dayId, days.map((d) => d.id)),
      })
    : [];
  const byDay = days.map((d) => allVars.filter((v) => v.dayId === d.id));
  const weeks = deriveWeeks(byDay.map((vs) => vs.map((v) => ({ position: v.position, name: v.name }))));
  const cols = weeks.length ? weeks : [{ position: 0, name: "Week 1" }];
  await db.transaction(async (tx) => {
    const [day] = await tx
      .insert(schema.days)
      .values({ programId, position: days.length, name: `Day ${days.length + 1}`, defaultRestSeconds: 90 })
      .returning({ id: schema.days.id });
    await tx.insert(schema.variations).values(
      cols.map((c) => ({ dayId: day.id, position: c.position, name: c.name })),
    );
  });
  revalidatePath(`/workouts/${programId}`);
  redirect(`/workouts/${programId}`);
}

export async function renameDay(dayId: string, name: string) {
  const userId = await requireUserId();
  const day = await ownedDay(dayId, userId);
  const db = await getDb();
  await db
    .update(schema.days)
    .set({ name: name.trim().slice(0, 80) || "Day" })
    .where(eq(schema.days.id, dayId));
  revalidatePath(`/workouts/${day.programId}`);
}

/** Delete a day (cascades its variations/exercises/sessions). Deleting the last
 * day deletes the whole workout. */
export async function deleteDay(dayId: string) {
  const userId = await requireUserId();
  const day = await ownedDay(dayId, userId);
  const db = await getDb();
  await db.delete(schema.days).where(eq(schema.days.id, dayId));
  const remaining = await db.query.days.findFirst({
    where: eq(schema.days.programId, day.programId),
  });
  if (!remaining) {
    await db.delete(schema.programs).where(eq(schema.programs.id, day.programId));
    revalidatePath("/workouts");
    redirect("/workouts");
  }
  revalidatePath(`/workouts/${day.programId}`);
  redirect(`/workouts/${day.programId}`);
}

export async function deleteProgram(programId: string) {
  const userId = await requireUserId();
  await ownedProgram(programId, userId);
  const db = await getDb();
  await db.delete(schema.programs).where(eq(schema.programs.id, programId));
  revalidatePath("/workouts");
  redirect("/workouts");
}

/** Add a week to a workout by copying `sourceWeekPos` forward for every day
 * (exercises included, fresh lineage — a copy until the user aligns it). */
export async function addWeek(programId: string, sourceWeekPos: number) {
  const userId = await requireUserId();
  await ownedProgram(programId, userId);
  const db = await getDb();
  const days = await db.query.days.findMany({ where: eq(schema.days.programId, programId) });
  const allVars = days.length
    ? await db.query.variations.findMany({
        where: inArray(schema.variations.dayId, days.map((d) => d.id)),
      })
    : [];
  const newPos = Math.max(0, ...allVars.map((v) => v.position + 1));
  // Read each day's source-week exercises up front (outside the tx).
  const sources = await Promise.all(
    days.map(async (d) => {
      const src = allVars.find((v) => v.dayId === d.id && v.position === sourceWeekPos);
      const exercises = src
        ? await db.query.exercises.findMany({
            where: eq(schema.exercises.variationId, src.id),
            orderBy: asc(schema.exercises.position),
          })
        : [];
      return { dayId: d.id, exercises };
    }),
  );
  await db.transaction(async (tx) => {
    for (const s of sources) {
      const [nv] = await tx
        .insert(schema.variations)
        .values({ dayId: s.dayId, position: newPos, name: `Week ${newPos + 1}` })
        .returning({ id: schema.variations.id });
      if (s.exercises.length) {
        await tx.insert(schema.exercises).values(
          s.exercises.map((e) => ({
            variationId: nv.id,
            position: e.position,
            lineageId: crypto.randomUUID(),
            sectionName: e.sectionName,
            supersetKey: e.supersetKey,
            name: e.name,
            sets: e.sets,
            measurement: e.measurement,
            repScheme: e.repScheme,
            repsMin: e.repsMin,
            repsMax: e.repsMax,
            timeSeconds: e.timeSeconds,
            restOverrideSeconds: e.restOverrideSeconds,
            note: e.note,
            weightUnit: e.weightUnit,
            targetWeight: e.targetWeight,
          })),
        );
      }
    }
  });
  revalidatePath(`/workouts/${programId}`);
  redirect(`/workouts/${programId}?week=${newPos}`);
}

/** Rename a week program-wide (updates every day's variation at that position). */
export async function renameWeek(programId: string, weekPos: number, name: string) {
  const userId = await requireUserId();
  await ownedProgram(programId, userId);
  const db = await getDb();
  const days = await db.query.days.findMany({ where: eq(schema.days.programId, programId) });
  const clean = name.trim().slice(0, 60) || `Week ${weekPos + 1}`;
  await db
    .update(schema.variations)
    .set({ name: clean })
    .where(
      and(inArray(schema.variations.dayId, days.map((d) => d.id)), eq(schema.variations.position, weekPos)),
    );
  revalidatePath(`/workouts/${programId}`);
}

/** Delete a week from every day and reindex later weeks so positions stay
 * contiguous. Refuses to delete the last remaining week. */
export async function deleteWeek(programId: string, weekPos: number) {
  const userId = await requireUserId();
  await ownedProgram(programId, userId);
  const db = await getDb();
  const days = await db.query.days.findMany({ where: eq(schema.days.programId, programId) });
  const allVars = days.length
    ? await db.query.variations.findMany({
        where: inArray(schema.variations.dayId, days.map((d) => d.id)),
      })
    : [];
  const weekCount = Math.max(0, ...allVars.map((v) => v.position + 1));
  if (weekCount <= 1) throw new Error("A workout needs at least one week");
  const toDelete = allVars.filter((v) => v.position === weekPos).map((v) => v.id);
  const toShift = allVars.filter((v) => v.position > weekPos);
  await db.transaction(async (tx) => {
    if (toDelete.length) await tx.delete(schema.variations).where(inArray(schema.variations.id, toDelete));
    for (const v of toShift) {
      await tx
        .update(schema.variations)
        .set({ position: v.position - 1 })
        .where(eq(schema.variations.id, v.id));
    }
  });
  revalidatePath(`/workouts/${programId}`);
  redirect(`/workouts/${programId}`);
}
