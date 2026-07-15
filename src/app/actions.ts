"use server";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/auth";
import { getDb, schema } from "@/db";
import type { Measurement, RepScheme } from "@/db/schema";
import type { WeightUnit } from "@/lib/workout";

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
  let dayId = "";
  await db.transaction(async (tx) => {
    const [program] = await tx
      .insert(schema.programs)
      .values({ userId, name: data.name })
      .returning({ id: schema.programs.id });
    const [day] = await tx
      .insert(schema.days)
      .values({ programId: program.id, position: 0, name: data.name, defaultRestSeconds: data.defaultRestSeconds })
      .returning({ id: schema.days.id });
    const [variation] = await tx
      .insert(schema.variations)
      .values({ dayId: day.id, position: 0, name: "Base" })
      .returning({ id: schema.variations.id });
    const rows = flattenBlockExercises(data.blocks, variation.id);
    if (rows.length) await tx.insert(schema.exercises).values(rows);
    dayId = day.id;
  });
  revalidatePath("/workouts");
  redirect(`/workouts/${dayId}`);
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

export async function createVariation(dayId: string, sourceVariationId: string) {
  const userId = await requireUserId();
  await ownedDay(dayId, userId);
  const source = await ownedVariation(sourceVariationId, userId);
  const db = await getDb();
  const siblings = await db.query.variations.findMany({ where: eq(schema.variations.dayId, dayId) });
  const sourceExercises = await db.query.exercises.findMany({
    where: eq(schema.exercises.variationId, sourceVariationId),
    orderBy: asc(schema.exercises.position),
  });
  let newId = "";
  await db.transaction(async (tx) => {
    const [v] = await tx
      .insert(schema.variations)
      .values({ dayId, position: siblings.length, name: `${source.name} copy`.slice(0, 60) })
      .returning({ id: schema.variations.id });
    newId = v.id;
    if (sourceExercises.length) {
      await tx.insert(schema.exercises).values(
        sourceExercises.map((e) => ({
          variationId: v.id,
          position: e.position,
          lineageId: crypto.randomUUID(), // fresh: a copy is a new lineage until user aligns it
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
  });
  revalidatePath(`/workouts/${dayId}`);
  redirect(`/workouts/${dayId}?v=${newId}`);
}

export async function renameVariation(variationId: string, name: string) {
  const userId = await requireUserId();
  const v = await ownedVariation(variationId, userId);
  const db = await getDb();
  await db
    .update(schema.variations)
    .set({ name: name.trim().slice(0, 60) || "Variation" })
    .where(eq(schema.variations.id, variationId));
  revalidatePath(`/workouts/${v.dayId}`);
}

export async function deleteVariation(variationId: string) {
  const userId = await requireUserId();
  const v = await ownedVariation(variationId, userId);
  const db = await getDb();
  const siblings = await db.query.variations.findMany({ where: eq(schema.variations.dayId, v.dayId) });
  if (siblings.length <= 1) throw new Error("A day needs at least one variation");
  await db.delete(schema.variations).where(eq(schema.variations.id, variationId));
  revalidatePath(`/workouts/${v.dayId}`);
  redirect(`/workouts/${v.dayId}`);
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

  revalidatePath("/workouts");
  revalidatePath(`/workouts/${dayId}`);
  redirect(`/workouts/${dayId}?v=${variationId}`);
}

export async function deleteWorkout(dayId: string) {
  const userId = await requireUserId();
  const day = await ownedDay(dayId, userId);
  const db = await getDb();
  await db.delete(schema.days).where(eq(schema.days.id, dayId));
  const remaining = await db.query.days.findFirst({
    where: eq(schema.days.programId, day.programId),
  });
  if (!remaining) await db.delete(schema.programs).where(eq(schema.programs.id, day.programId));
  revalidatePath("/workouts");
  redirect("/workouts");
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
  revalidatePath(`/workouts/${session.dayId}`);
  revalidatePath("/workouts");
}

export async function deleteSession(sessionId: string) {
  const userId = await requireUserId();
  const session = await ownedSession(sessionId, userId);
  const db = await getDb();
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
  revalidatePath(`/workouts/${session.dayId}`);
  redirect(`/workouts/${session.dayId}`);
}

export type ImportSetPayload = { setNumber: number; weight: number | null; reps: number | null };
export type ImportCellPayload = { sets: ImportSetPayload[]; note: string | null } | null;
export type ImportExercisePayload = {
  name: string;
  sets: number;
  weightUnit: WeightUnit;
  repScheme: RepScheme;
  repsMin: number | null;
  note: string | null;
  blockStart: boolean;
  cells: ImportCellPayload[];
};
export type ImportDayPayload = { name: string; dates: string[]; exercises: ImportExercisePayload[] };

export async function importSpreadsheet(days: ImportDayPayload[]) {
  const userId = await requireUserId();
  const db = await getDb();

  await db.transaction(async (tx) => {
    for (const dayPayload of days) {
      const name = dayPayload.name.trim().slice(0, 80) || "Imported workout";
      const [program] = await tx
        .insert(schema.programs)
        .values({ userId, name })
        .returning({ id: schema.programs.id });
      const [day] = await tx
        .insert(schema.days)
        .values({ programId: program.id, position: 0, name, defaultRestSeconds: 90 })
        .returning({ id: schema.days.id });
      const [variation] = await tx
        .insert(schema.variations)
        .values({ dayId: day.id, position: 0, name: "Base" })
        .returning({ id: schema.variations.id });

      const sessionIds: string[] = [];
      for (const iso of dayPayload.dates) {
        const startedAt = new Date(iso);
        if (Number.isNaN(startedAt.getTime())) throw new Error("Invalid date in import");
        const [s] = await tx
          .insert(schema.sessions)
          .values({ dayId: day.id, variationId: variation.id, userId, startedAt, finishedAt: startedAt })
          .returning({ id: schema.sessions.id });
        sessionIds.push(s.id);
      }

      // Group merged-Sets rows into supersets; blocks hold at most 3 exercises.
      const groups: ImportExercisePayload[][] = [];
      for (const e of dayPayload.exercises) {
        const last = groups.at(-1);
        if (e.blockStart || !last || last.length >= 3) groups.push([e]);
        else last.push(e);
      }

      for (const [gi, group] of groups.entries()) {
        const supersetKey = crypto.randomUUID();
        for (const [j, e] of group.entries()) {
          const sets = Math.min(20, Math.max(1, Math.round(e.sets) || 1));
          const [exercise] = await tx
            .insert(schema.exercises)
            .values({
              variationId: variation.id,
              position: gi * 1000 + j,
              lineageId: crypto.randomUUID(),
              sectionName: null,
              supersetKey,
              name: e.name.trim().slice(0, 120),
              sets,
              measurement: "reps",
              repScheme: e.repScheme === "failure" ? "failure" : "fixed",
              repsMin:
                e.repScheme === "failure"
                  ? null
                  : Math.min(999, Math.max(1, Math.round(e.repsMin ?? 10))),
              repsMax: null,
              timeSeconds: null,
              restOverrideSeconds: null,
              note: e.note?.trim().slice(0, 500) || null,
              weightUnit: e.weightUnit === "bricks" ? "bricks" : "kg",
              targetWeight: null,
            })
            .returning({ id: schema.exercises.id });

          for (const [ci, cell] of e.cells.entries()) {
            const sessionId = sessionIds[ci];
            if (!cell || !sessionId) continue;
            const logs = cell.sets
              .filter((s) => s.setNumber >= 1 && s.setNumber <= sets)
              .map((s) => ({
                sessionId,
                exerciseId: exercise.id,
                setNumber: Math.round(s.setNumber),
                weight: s.weight,
                reps: s.reps == null ? null : Math.round(s.reps),
                timeSeconds: null,
              }));
            if (logs.length) await tx.insert(schema.setLogs).values(logs);
            if (cell.note?.trim()) {
              await tx.insert(schema.sessionNotes).values({
                sessionId,
                exerciseId: exercise.id,
                note: cell.note.trim().slice(0, 500),
              });
            }
          }
        }
      }
    }
  });

  revalidatePath("/workouts");
  redirect("/workouts");
}
