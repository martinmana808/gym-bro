import { eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

function csvCell(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const db = await getDb();
  const workouts = await db.query.workouts.findMany({
    where: eq(schema.workouts.userId, userId),
  });
  const workoutIds = workouts.map((w) => w.id);
  const blocks = workoutIds.length
    ? await db.query.blocks.findMany({ where: inArray(schema.blocks.workoutId, workoutIds) })
    : [];
  const exercises = blocks.length
    ? await db.query.exercises.findMany({
        where: inArray(schema.exercises.blockId, blocks.map((b) => b.id)),
      })
    : [];
  const sessions = workoutIds.length
    ? await db.query.sessions.findMany({
        where: inArray(schema.sessions.workoutId, workoutIds),
        orderBy: schema.sessions.startedAt,
      })
    : [];
  const sessionIds = sessions.map((s) => s.id);
  const logs = sessionIds.length
    ? await db.query.setLogs.findMany({
        where: inArray(schema.setLogs.sessionId, sessionIds),
        orderBy: schema.setLogs.setNumber,
      })
    : [];
  const notes = sessionIds.length
    ? await db.query.sessionNotes.findMany({
        where: inArray(schema.sessionNotes.sessionId, sessionIds),
      })
    : [];

  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  const blockById = new Map(blocks.map((b) => [b.id, b]));
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const noteByKey = new Map(notes.map((n) => [`${n.sessionId}#${n.exerciseId}`, n.note]));

  const header = "workout,exercise,date,set,weight,unit,reps,seconds,exercise_note,session_note";
  const rows = logs.map((l) => {
    const exercise = exerciseById.get(l.exerciseId);
    const s = sessionById.get(l.sessionId);
    const workout = exercise
      ? workoutById.get(blockById.get(exercise.blockId)?.workoutId ?? "")
      : undefined;
    return [
      workout?.name ?? "",
      exercise?.name ?? "",
      s ? s.startedAt.toISOString().slice(0, 10) : "",
      l.setNumber,
      l.weight,
      exercise?.weightUnit ?? "kg",
      l.reps,
      l.timeSeconds,
      exercise?.note ?? "",
      noteByKey.get(`${l.sessionId}#${l.exerciseId}`) ?? "",
    ]
      .map(csvCell)
      .join(",");
  });
  return new Response([header, ...rows].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="gym-bro-export.csv"',
    },
  });
}
