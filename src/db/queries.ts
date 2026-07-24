import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Block, Exercise, Session, SessionNote, SetLog, Variation, Workout } from "@/db/schema";
import { groupExercisesIntoBlocks } from "@/lib/workout";
import { deriveWeeks, missingCells, type WeekCol } from "@/lib/weeks";

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
    programId: program.id,
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
    programId: program.id,
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
      programId: program.id,
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

/** Insert-only: pad any missing (day, position) cell in a program with an empty
 * variation labelled from the week column. Idempotent; never deletes or moves. */
async function normalizeProgram(programId: string): Promise<void> {
  const db = await getDb();
  const days = await db.query.days.findMany({
    where: eq(schema.days.programId, programId),
    orderBy: asc(schema.days.position),
  });
  if (!days.length) return;
  const vars = await db.query.variations.findMany({
    where: inArray(schema.variations.dayId, days.map((d) => d.id)),
  });
  const byDay = days.map((d) => vars.filter((v) => v.dayId === d.id));
  const weeks = deriveWeeks(byDay.map((vs) => vs.map((v) => ({ position: v.position, name: v.name }))));
  const gaps = missingCells(byDay.map((vs) => vs.map((v) => ({ position: v.position }))), weeks.length);
  if (!gaps.length) return;
  await db.insert(schema.variations).values(
    gaps.map((g) => ({
      dayId: days[g.dayIndex].id,
      position: g.position,
      name: weeks[g.position].name,
    })),
  );
}

export type ProgramListItem = {
  id: string;
  name: string;
  dayCount: number;
  lastFinishedAt: Date | null;
  unfinishedSessionId: string | null;
};

/** One row per program (a "Workout"): day count, last finished session, any
 * unfinished session across its days. */
export async function listPrograms(userId: string): Promise<ProgramListItem[]> {
  const db = await getDb();
  const programs = await db.query.programs.findMany({
    where: eq(schema.programs.userId, userId),
    orderBy: asc(schema.programs.createdAt),
  });
  if (!programs.length) return [];
  const days = await db.query.days.findMany({
    where: inArray(schema.days.programId, programs.map((p) => p.id)),
  });
  const dayIds = days.map((d) => d.id);
  const sessions = dayIds.length
    ? await db.query.sessions.findMany({
        where: inArray(schema.sessions.dayId, dayIds),
        orderBy: desc(schema.sessions.startedAt),
      })
    : [];
  return programs.map((p) => {
    const pd = days.filter((d) => d.programId === p.id);
    const pdIds = new Set(pd.map((d) => d.id));
    const ps = sessions.filter((s) => pdIds.has(s.dayId));
    return {
      id: p.id,
      name: p.name,
      dayCount: pd.length,
      lastFinishedAt: ps.find((s) => s.finishedAt)?.finishedAt ?? null,
      unfinishedSessionId: ps.find((s) => !s.finishedAt)?.id ?? null,
    };
  });
}

export type HubDay = {
  id: string;
  name: string;
  position: number;
  cellVariationId: string | null;
  exerciseCount: number;
  sectionSummary: string;
  unfinishedSessionId: string | null;
};
export type ProgramHub = {
  program: { id: string; name: string };
  weeks: WeekCol[];
  selectedWeek: number;
  days: HubDay[];
};

/** The workout hub: week columns + the days, each resolved to its cell for the
 * selected week. `weekParam` (a position) selects the week; default is the week
 * of the most recent session, else the last week. */
export async function getProgramHub(
  programId: string,
  userId: string,
  weekParam?: number,
): Promise<ProgramHub | null> {
  const db = await getDb();
  const program = await db.query.programs.findFirst({
    where: and(eq(schema.programs.id, programId), eq(schema.programs.userId, userId)),
  });
  if (!program) return null;
  await normalizeProgram(programId);
  const days = await db.query.days.findMany({
    where: eq(schema.days.programId, programId),
    orderBy: asc(schema.days.position),
  });
  const dayIds = days.map((d) => d.id);
  const vars = dayIds.length
    ? await db.query.variations.findMany({
        where: inArray(schema.variations.dayId, dayIds),
        orderBy: asc(schema.variations.position),
      })
    : [];
  const byDay = days.map((d) => vars.filter((v) => v.dayId === d.id));
  const weeks = deriveWeeks(byDay.map((vs) => vs.map((v) => ({ position: v.position, name: v.name }))));
  const sessions = dayIds.length
    ? await db.query.sessions.findMany({
        where: inArray(schema.sessions.dayId, dayIds),
        orderBy: desc(schema.sessions.startedAt),
      })
    : [];
  let selectedWeek = weeks.length ? weeks[weeks.length - 1].position : 0;
  if (weekParam != null && weeks.some((w) => w.position === weekParam)) {
    selectedWeek = weekParam;
  } else if (sessions[0]) {
    const lv = vars.find((v) => v.id === sessions[0].variationId);
    if (lv) selectedWeek = lv.position;
  }
  const cellVarByDay = new Map<string, string | null>(
    days.map((d, i) => [d.id, byDay[i].find((v) => v.position === selectedWeek)?.id ?? null]),
  );
  const cellIds = [...cellVarByDay.values()].filter((x): x is string => !!x);
  const exs = cellIds.length
    ? await db.query.exercises.findMany({ where: inArray(schema.exercises.variationId, cellIds) })
    : [];
  const hubDays: HubDay[] = days.map((d) => {
    const cid = cellVarByDay.get(d.id) ?? null;
    const de = exs.filter((e) => e.variationId === cid);
    const sections = [...new Set(de.map((e) => e.sectionName).filter((s): s is string => !!s))];
    const mine = sessions.filter((s) => s.dayId === d.id);
    return {
      id: d.id,
      name: d.name,
      position: d.position,
      cellVariationId: cid,
      exerciseCount: de.length,
      sectionSummary: sections.join(" · "),
      unfinishedSessionId: mine.find((s) => !s.finishedAt)?.id ?? null,
    };
  });
  return { program: { id: program.id, name: program.name }, weeks, selectedWeek, days: hubDays };
}

/** The variation id for a given (day, week position), or null. Used by the day
 * detail and cell-edit pages. Verifies ownership. */
export async function getDayCellVariationId(
  dayId: string,
  weekPos: number,
  userId: string,
): Promise<string | null> {
  const owned = await ownedDayWorkout(dayId, userId);
  if (!owned) return null;
  const db = await getDb();
  const v = await db.query.variations.findFirst({
    where: and(eq(schema.variations.dayId, dayId), eq(schema.variations.position, weekPos)),
  });
  return v?.id ?? null;
}
