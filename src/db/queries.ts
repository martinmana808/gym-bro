import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Block, Exercise, Session, SessionNote, SetLog, Workout } from "@/db/schema";

export type WorkoutStructure = {
  workout: Workout;
  blocks: (Block & { exercises: Exercise[] })[];
};

export async function getWorkoutStructure(
  workoutId: string,
  userId: string,
): Promise<WorkoutStructure | null> {
  const db = await getDb();
  const workout = await db.query.workouts.findFirst({
    where: and(eq(schema.workouts.id, workoutId), eq(schema.workouts.userId, userId)),
  });
  if (!workout) return null;
  const blocks = await db.query.blocks.findMany({
    where: eq(schema.blocks.workoutId, workoutId),
    orderBy: schema.blocks.position,
  });
  const exercises = blocks.length
    ? await db.query.exercises.findMany({
        where: inArray(schema.exercises.blockId, blocks.map((b) => b.id)),
        orderBy: schema.exercises.position,
      })
    : [];
  return {
    workout,
    blocks: blocks.map((b) => ({
      ...b,
      exercises: exercises.filter((e) => e.blockId === b.id),
    })),
  };
}

export type WorkoutListItem = Workout & {
  exerciseCount: number;
  lastFinishedAt: Date | null;
  unfinishedSessionId: string | null;
};

export async function listWorkouts(userId: string): Promise<WorkoutListItem[]> {
  const db = await getDb();
  const workouts = await db.query.workouts.findMany({
    where: eq(schema.workouts.userId, userId),
    orderBy: schema.workouts.createdAt,
  });
  if (!workouts.length) return [];
  const ids = workouts.map((w) => w.id);
  const blocks = await db.query.blocks.findMany({
    where: inArray(schema.blocks.workoutId, ids),
  });
  const exercises = blocks.length
    ? await db.query.exercises.findMany({
        where: inArray(schema.exercises.blockId, blocks.map((b) => b.id)),
      })
    : [];
  const sessions = await db.query.sessions.findMany({
    where: inArray(schema.sessions.workoutId, ids),
    orderBy: desc(schema.sessions.startedAt),
  });
  return workouts.map((w) => {
    const blockIds = new Set(blocks.filter((b) => b.workoutId === w.id).map((b) => b.id));
    const mine = sessions.filter((s) => s.workoutId === w.id);
    return {
      ...w,
      exerciseCount: exercises.filter((e) => blockIds.has(e.blockId)).length,
      lastFinishedAt: mine.find((s) => s.finishedAt)?.finishedAt ?? null,
      unfinishedSessionId: mine.find((s) => !s.finishedAt)?.id ?? null,
    };
  });
}

export type WorkoutHistory = {
  sessions: Session[]; // most recent first, finished only
  logsBySession: Record<string, SetLog[]>;
  notesBySession: Record<string, SessionNote[]>;
};

export async function getWorkoutHistory(
  workoutId: string,
  limit = 6,
): Promise<WorkoutHistory> {
  const db = await getDb();
  const sessions = await db.query.sessions.findMany({
    where: eq(schema.sessions.workoutId, workoutId),
    orderBy: desc(schema.sessions.startedAt),
  });
  const finished = sessions.filter((s) => s.finishedAt).slice(0, limit);
  const logs = finished.length
    ? await db.query.setLogs.findMany({
        where: inArray(schema.setLogs.sessionId, finished.map((s) => s.id)),
        orderBy: schema.setLogs.setNumber,
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
  return { sessions: finished, logsBySession, notesBySession };
}

export async function getUnfinishedSession(workoutId: string, userId: string) {
  const db = await getDb();
  return db.query.sessions.findFirst({
    where: and(
      eq(schema.sessions.workoutId, workoutId),
      eq(schema.sessions.userId, userId),
      isNull(schema.sessions.finishedAt),
    ),
    orderBy: desc(schema.sessions.startedAt),
  });
}

export type SessionData = {
  session: Session;
  structure: WorkoutStructure;
  logs: SetLog[]; // this session
  previousLogs: SetLog[]; // most recent finished session before this one
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
  const structure = await getWorkoutStructure(session.workoutId, userId);
  if (!structure) return null;
  const logs = await db.query.setLogs.findMany({
    where: eq(schema.setLogs.sessionId, sessionId),
  });
  const previous = await db.query.sessions.findMany({
    where: and(eq(schema.sessions.workoutId, session.workoutId), eq(schema.sessions.userId, userId)),
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
