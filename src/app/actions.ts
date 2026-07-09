"use server";

import { and, eq, inArray } from "drizzle-orm";
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
};

export type BlockInput = { id?: string; exercises: ExerciseInput[] };

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
        })),
    }))
    .filter((b) => b.exercises.length > 0);
  return {
    name: input.name.trim() || "Untitled workout",
    defaultRestSeconds: int(input.defaultRestSeconds, 0, 3600, 90),
    blocks,
  };
}

export async function createWorkout(input: WorkoutInput) {
  const userId = await requireUserId();
  const db = await getDb();
  const data = sanitizeWorkout(input);
  const [workout] = await db
    .insert(schema.workouts)
    .values({ userId, name: data.name, defaultRestSeconds: data.defaultRestSeconds })
    .returning({ id: schema.workouts.id });
  await insertBlocks(workout.id, data.blocks);
  revalidatePath("/workouts");
  redirect(`/workouts/${workout.id}`);
}

async function insertBlocks(workoutId: string, blocks: BlockInput[], startPos = 0) {
  const db = await getDb();
  for (const [i, block] of blocks.entries()) {
    const [row] = await db
      .insert(schema.blocks)
      .values({ workoutId, position: startPos + i })
      .returning({ id: schema.blocks.id });
    await db.insert(schema.exercises).values(
      block.exercises.map((e, j) => ({
        blockId: row.id,
        position: j,
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
      })),
    );
  }
}

async function ownedWorkout(workoutId: string, userId: string) {
  const db = await getDb();
  const workout = await db.query.workouts.findFirst({
    where: and(eq(schema.workouts.id, workoutId), eq(schema.workouts.userId, userId)),
  });
  if (!workout) throw new Error("Workout not found");
  return workout;
}

/**
 * Update-in-place: blocks/exercises whose ids are echoed back are updated
 * (preserving their set-log history), missing ones are deleted, new ones inserted.
 */
export async function updateWorkout(workoutId: string, input: WorkoutInput) {
  const userId = await requireUserId();
  await ownedWorkout(workoutId, userId);
  const db = await getDb();
  const data = sanitizeWorkout(input);

  await db
    .update(schema.workouts)
    .set({ name: data.name, defaultRestSeconds: data.defaultRestSeconds })
    .where(eq(schema.workouts.id, workoutId));

  const existingBlocks = await db.query.blocks.findMany({
    where: eq(schema.blocks.workoutId, workoutId),
  });
  const existingBlockIds = new Set(existingBlocks.map((b) => b.id));
  const existingExercises = existingBlocks.length
    ? await db.query.exercises.findMany({
        where: inArray(schema.exercises.blockId, [...existingBlockIds]),
      })
    : [];
  const existingExerciseIds = new Set(existingExercises.map((e) => e.id));

  const keptBlockIds = new Set(
    data.blocks.map((b) => b.id).filter((id): id is string => !!id && existingBlockIds.has(id)),
  );
  const keptExerciseIds = new Set(
    data.blocks
      .flatMap((b) => b.exercises.map((e) => e.id))
      .filter((id): id is string => !!id && existingExerciseIds.has(id)),
  );

  const dropBlocks = [...existingBlockIds].filter((id) => !keptBlockIds.has(id));
  if (dropBlocks.length) await db.delete(schema.blocks).where(inArray(schema.blocks.id, dropBlocks));
  const dropExercises = existingExercises
    .filter((e) => keptBlockIds.has(e.blockId) && !keptExerciseIds.has(e.id))
    .map((e) => e.id);
  if (dropExercises.length)
    await db.delete(schema.exercises).where(inArray(schema.exercises.id, dropExercises));

  for (const [i, block] of data.blocks.entries()) {
    let blockId = block.id && keptBlockIds.has(block.id) ? block.id : null;
    if (blockId) {
      await db.update(schema.blocks).set({ position: i }).where(eq(schema.blocks.id, blockId));
    } else {
      const [row] = await db
        .insert(schema.blocks)
        .values({ workoutId, position: i })
        .returning({ id: schema.blocks.id });
      blockId = row.id;
    }
    for (const [j, e] of block.exercises.entries()) {
      const values = {
        blockId,
        position: j,
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
      };
      if (e.id && keptExerciseIds.has(e.id)) {
        await db.update(schema.exercises).set(values).where(eq(schema.exercises.id, e.id));
      } else {
        await db.insert(schema.exercises).values(values);
      }
    }
  }

  revalidatePath("/workouts");
  revalidatePath(`/workouts/${workoutId}`);
  redirect(`/workouts/${workoutId}`);
}

export async function deleteWorkout(workoutId: string) {
  const userId = await requireUserId();
  await ownedWorkout(workoutId, userId);
  const db = await getDb();
  await db.delete(schema.workouts).where(eq(schema.workouts.id, workoutId));
  revalidatePath("/workouts");
  redirect("/workouts");
}

export async function startSession(workoutId: string) {
  const userId = await requireUserId();
  await ownedWorkout(workoutId, userId);
  const db = await getDb();
  const [session] = await db
    .insert(schema.sessions)
    .values({ workoutId, userId })
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
  };
  await db
    .insert(schema.setLogs)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.setLogs.sessionId, schema.setLogs.exerciseId, schema.setLogs.setNumber],
      set: { weight: values.weight, reps: values.reps, timeSeconds: values.timeSeconds },
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
  revalidatePath(`/workouts/${session.workoutId}`);
  revalidatePath("/workouts");
}

export async function deleteSession(sessionId: string) {
  const userId = await requireUserId();
  const session = await ownedSession(sessionId, userId);
  const db = await getDb();
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
  revalidatePath(`/workouts/${session.workoutId}`);
  redirect(`/workouts/${session.workoutId}`);
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
  for (const dayPayload of days) {
    const [workout] = await db
      .insert(schema.workouts)
      .values({
        userId,
        name: dayPayload.name.trim().slice(0, 80) || "Imported workout",
        defaultRestSeconds: 90,
      })
      .returning({ id: schema.workouts.id });

    const sessionIds: string[] = [];
    for (const iso of dayPayload.dates) {
      const startedAt = new Date(iso);
      if (Number.isNaN(startedAt.getTime())) throw new Error("Invalid date in import");
      const [s] = await db
        .insert(schema.sessions)
        // finishedAt = startedAt: imported sessions are finished; duration unknown → renders "—".
        .values({ workoutId: workout.id, userId, startedAt, finishedAt: startedAt })
        .returning({ id: schema.sessions.id });
      sessionIds.push(s.id);
    }

    // Group merged-Sets rows into blocks; blocks hold at most 3 exercises.
    const groups: ImportExercisePayload[][] = [];
    for (const e of dayPayload.exercises) {
      const last = groups.at(-1);
      if (e.blockStart || !last || last.length >= 3) groups.push([e]);
      else last.push(e);
    }

    for (const [position, group] of groups.entries()) {
      const [block] = await db
        .insert(schema.blocks)
        .values({ workoutId: workout.id, position })
        .returning({ id: schema.blocks.id });
      for (const [j, e] of group.entries()) {
        const sets = Math.min(20, Math.max(1, Math.round(e.sets) || 1));
        const [exercise] = await db
          .insert(schema.exercises)
          .values({
            blockId: block.id,
            position: j,
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
          if (logs.length) await db.insert(schema.setLogs).values(logs);
          if (cell.note?.trim()) {
            await db.insert(schema.sessionNotes).values({
              sessionId,
              exerciseId: exercise.id,
              note: cell.note.trim().slice(0, 500),
            });
          }
        }
      }
    }
  }
  revalidatePath("/workouts");
  redirect("/workouts");
}
