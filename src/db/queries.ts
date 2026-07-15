import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Block, Exercise, Session, SessionNote, SetLog, Variation, Workout } from "@/db/schema";
import { groupExercisesIntoBlocks } from "@/lib/workout";

export type WorkoutStructure = {
  workout: Workout;
  blocks: (Block & { exercises: Exercise[] })[];
};

/** The single "Base" variation of a day (Stage 1 has exactly one per day). */
async function dayView(dayId: string, userId: string) {
  const db = await getDb();
  const day = await db.query.days.findFirst({ where: eq(schema.days.id, dayId) });
  if (!day) return null;
  const program = await db.query.programs.findFirst({
    where: and(eq(schema.programs.id, day.programId), eq(schema.programs.userId, userId)),
  });
  if (!program) return null;
  const variation = await db.query.variations.findFirst({
    where: eq(schema.variations.dayId, dayId),
    orderBy: asc(schema.variations.position),
  });
  const workout: Workout = {
    id: day.id,
    userId: program.userId,
    name: day.name,
    defaultRestSeconds: day.defaultRestSeconds,
    createdAt: program.createdAt,
  };
  return { day, program, variation, workout };
}

async function ownedDayWorkout(dayId: string, userId: string): Promise<Workout | null> {
  const db = await getDb();
  const day = await db.query.days.findFirst({ where: eq(schema.days.id, dayId) });
  if (!day) return null;
  const program = await db.query.programs.findFirst({
    where: and(eq(schema.programs.id, day.programId), eq(schema.programs.userId, userId)),
  });
  if (!program) return null;
  return {
    id: day.id,
    userId: program.userId,
    name: day.name,
    defaultRestSeconds: day.defaultRestSeconds,
    createdAt: program.createdAt,
  };
}

export async function listDayVariations(dayId: string, userId: string): Promise<Variation[]> {
  const db = await getDb();
  const workout = await ownedDayWorkout(dayId, userId);
  if (!workout) return [];
  return db.query.variations.findMany({
    where: eq(schema.variations.dayId, dayId),
    orderBy: asc(schema.variations.position),
  });
}

export async function getVariationStructure(
  variationId: string,
  userId: string,
): Promise<(WorkoutStructure & { variation: Variation }) | null> {
  const db = await getDb();
  const variation = await db.query.variations.findFirst({
    where: eq(schema.variations.id, variationId),
  });
  if (!variation) return null;
  const workout = await ownedDayWorkout(variation.dayId, userId);
  if (!workout) return null;
  const exercises = await db.query.exercises.findMany({
    where: eq(schema.exercises.variationId, variationId),
    orderBy: asc(schema.exercises.position),
  });
  const blocks = groupExercisesIntoBlocks(exercises).map((g, i) => ({
    id: g.key,
    position: i,
    exercises: g.exercises,
  }));
  return { workout, blocks, variation };
}

export async function getWorkoutStructure(
  dayId: string,
  userId: string,
): Promise<WorkoutStructure | null> {
  const db = await getDb();
  const first = await db.query.variations.findFirst({
    where: eq(schema.variations.dayId, dayId),
    orderBy: asc(schema.variations.position),
  });
  if (first) return getVariationStructure(first.id, userId);
  const workout = await ownedDayWorkout(dayId, userId);
  return workout ? { workout, blocks: [] } : null;
}

export type WorkoutListItem = Workout & {
  exerciseCount: number;
  lastFinishedAt: Date | null;
  unfinishedSessionId: string | null;
};

export async function listWorkouts(userId: string): Promise<WorkoutListItem[]> {
  const db = await getDb();
  const programs = await db.query.programs.findMany({
    where: eq(schema.programs.userId, userId),
    orderBy: asc(schema.programs.createdAt),
  });
  if (!programs.length) return [];
  const programById = new Map(programs.map((p) => [p.id, p]));
  const days = await db.query.days.findMany({
    where: inArray(schema.days.programId, programs.map((p) => p.id)),
    orderBy: asc(schema.days.position),
  });
  if (!days.length) return [];
  const dayIds = days.map((d) => d.id);
  const variations = await db.query.variations.findMany({
    where: inArray(schema.variations.dayId, dayIds),
    orderBy: asc(schema.variations.position),
  });
  // First variation per day = its Base.
  const baseVarByDay = new Map<string, string>();
  for (const v of variations) if (!baseVarByDay.has(v.dayId)) baseVarByDay.set(v.dayId, v.id);
  const baseVarIds = [...baseVarByDay.values()];
  const exercises = baseVarIds.length
    ? await db.query.exercises.findMany({
        where: inArray(schema.exercises.variationId, baseVarIds),
      })
    : [];
  const sessions = await db.query.sessions.findMany({
    where: inArray(schema.sessions.dayId, dayIds),
    orderBy: desc(schema.sessions.startedAt),
  });
  // Preserve the old ordering: by program.createdAt, then day.position.
  const ordered = [...days].sort((a, b) => {
    const pa = programById.get(a.programId)!.createdAt.getTime();
    const pb = programById.get(b.programId)!.createdAt.getTime();
    return pa - pb || a.position - b.position;
  });
  return ordered.map((d) => {
    const program = programById.get(d.programId)!;
    const baseVarId = baseVarByDay.get(d.id);
    const mine = sessions.filter((s) => s.dayId === d.id);
    return {
      id: d.id,
      userId: program.userId,
      name: d.name,
      defaultRestSeconds: d.defaultRestSeconds,
      createdAt: program.createdAt,
      exerciseCount: exercises.filter((e) => e.variationId === baseVarId).length,
      lastFinishedAt: mine.find((s) => s.finishedAt)?.finishedAt ?? null,
      unfinishedSessionId: mine.find((s) => !s.finishedAt)?.id ?? null,
    };
  });
}

export type WorkoutHistory = {
  sessions: Session[]; // most recent first, finished only
  logsBySession: Record<string, SetLog[]>;
  notesBySession: Record<string, SessionNote[]>;
  variationNameBySession: Record<string, string>;
};

export async function getWorkoutHistory(dayId: string, limit = 6): Promise<WorkoutHistory> {
  const db = await getDb();
  const sessions = await db.query.sessions.findMany({
    where: eq(schema.sessions.dayId, dayId),
    orderBy: desc(schema.sessions.startedAt),
  });
  const finished = sessions.filter((s) => s.finishedAt).slice(0, limit);
  const logs = finished.length
    ? await db.query.setLogs.findMany({
        where: inArray(schema.setLogs.sessionId, finished.map((s) => s.id)),
        orderBy: asc(schema.setLogs.setNumber),
      })
    : [];
  const logsBySession: Record<string, SetLog[]> = {};
  for (const s of finished) logsBySession[s.id] = logs.filter((l) => l.sessionId === s.id);
  const notes = finished.length
    ? await db.query.sessionNotes.findMany({
        where: inArray(schema.sessionNotes.sessionId, finished.map((s) => s.id)),
      })
    : [];
  const notesBySession: Record<string, SessionNote[]> = {};
  for (const s of finished) notesBySession[s.id] = notes.filter((n) => n.sessionId === s.id);
  const variationIds = [...new Set(finished.map((s) => s.variationId))];
  const vars = variationIds.length
    ? await db.query.variations.findMany({ where: inArray(schema.variations.id, variationIds) })
    : [];
  const nameById = new Map(vars.map((v) => [v.id, v.name]));
  const variationNameBySession: Record<string, string> = {};
  for (const s of finished) variationNameBySession[s.id] = nameById.get(s.variationId) ?? "";
  return { sessions: finished, logsBySession, notesBySession, variationNameBySession };
}

export async function getUnfinishedSession(dayId: string, userId: string) {
  const db = await getDb();
  const view = await dayView(dayId, userId);
  if (!view) return undefined;
  return db.query.sessions.findFirst({
    where: and(
      eq(schema.sessions.dayId, dayId),
      eq(schema.sessions.userId, userId),
      isNull(schema.sessions.finishedAt),
    ),
    orderBy: desc(schema.sessions.startedAt),
  });
}

export type SessionData = {
  session: Session;
  structure: WorkoutStructure;
  logs: SetLog[];
  previousLogs: SetLog[];
  notes: SessionNote[];
};

export async function getSessionData(
  sessionId: string,
  userId: string,
): Promise<SessionData | null> {
  const db = await getDb();
  const session = await db.query.sessions.findFirst({
    where: and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)),
  });
  if (!session) return null;
  const structure = await getVariationStructure(session.variationId, userId);
  if (!structure) return null;
  const logs = await db.query.setLogs.findMany({
    where: eq(schema.setLogs.sessionId, sessionId),
  });
  const previous = await db.query.sessions.findMany({
    where: and(
      eq(schema.sessions.dayId, session.dayId),
      eq(schema.sessions.variationId, session.variationId),
      eq(schema.sessions.userId, userId),
    ),
    orderBy: desc(schema.sessions.startedAt),
  });
  const prev = previous.find((s) => s.finishedAt && s.startedAt < session.startedAt);
  const previousLogs = prev
    ? await db.query.setLogs.findMany({ where: eq(schema.setLogs.sessionId, prev.id) })
    : [];
  const notes = await db.query.sessionNotes.findMany({
    where: eq(schema.sessionNotes.sessionId, sessionId),
  });
  return { session, structure, logs, previousLogs, notes };
}
