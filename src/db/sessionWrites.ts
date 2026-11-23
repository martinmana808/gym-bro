import "server-only";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import type { OutboxOp } from "@/lib/outbox";
import { clampFinishedAt } from "@/lib/activeSession";

/**
 * The database side of every write a running session makes.
 *
 * It lives here, apart from the server actions, because there are now two ways
 * in: the actions (used by the rest of the app) and `POST /api/outbox`, which
 * replays what a phone recorded while it had no signal. One implementation, so
 * the offline path can't drift away from the online one.
 */

/**
 * A write that will never succeed, however many times it's retried — the
 * session is gone, or was never this user's. The outbox needs to tell this
 * apart from "the network is down", because one should be dropped and
 * reported, and the other should be kept and tried again forever.
 */
export class WriteRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteRejected";
  }
}

export async function ownedSession(sessionId: string, userId: string) {
  const db = await getDb();
  const session = await db.query.sessions.findFirst({
    where: and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)),
  });
  if (!session) throw new WriteRejected("Session not found");
  return session;
}

export type LoggedSet = {
  exerciseId: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  timeSeconds: number | null;
  hitTarget?: boolean;
};

export async function writeSet(sessionId: string, input: LoggedSet) {
  const db = await getDb();
  const values = {
    sessionId,
    exerciseId: input.exerciseId,
    setNumber: input.setNumber,
    weight: input.weight,
    reps: input.reps,
    timeSeconds: input.timeSeconds,
    hitTarget: input.hitTarget ?? false,
    // Logging a set you'd skipped takes the skip back.
    skipped: false,
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
        skipped: false,
      },
    });
}

/**
 * Mark sets as deliberately not done. Stored rather than held in the page so
 * the rest of the app — the widget's "next up", where a reload resumes, when
 * the session counts as finished — can see the decision; otherwise it keeps
 * walking you back to the exercise you just turned down.
 *
 * Already-logged sets are left alone: skipping an exercise means "no more of
 * this today", not "throw away the sets I did do".
 */
export async function writeSkips(
  sessionId: string,
  sets: { exerciseId: string; setNumber: number }[],
) {
  if (!sets.length) return;
  const db = await getDb();
  await db
    .insert(schema.setLogs)
    .values(
      sets.map((s) => ({
        sessionId,
        exerciseId: s.exerciseId,
        setNumber: s.setNumber,
        weight: null,
        reps: null,
        timeSeconds: null,
        hitTarget: false,
        skipped: true,
      })),
    )
    .onConflictDoNothing({
      target: [schema.setLogs.sessionId, schema.setLogs.exerciseId, schema.setLogs.setNumber],
    });
}

/** Undo skips — all of them, or just one exercise's. Logged sets survive. */
export async function removeSkips(sessionId: string, exerciseId?: string) {
  const db = await getDb();
  await db
    .delete(schema.setLogs)
    .where(
      and(
        eq(schema.setLogs.sessionId, sessionId),
        eq(schema.setLogs.skipped, true),
        ...(exerciseId ? [eq(schema.setLogs.exerciseId, exerciseId)] : []),
      ),
    );
}

export async function writeNote(sessionId: string, exerciseId: string, raw: string) {
  const db = await getDb();
  const note = raw.trim().slice(0, 500);
  if (!note) {
    await db
      .delete(schema.sessionNotes)
      .where(
        and(
          eq(schema.sessionNotes.sessionId, sessionId),
          eq(schema.sessionNotes.exerciseId, exerciseId),
        ),
      );
    return;
  }
  await db
    .insert(schema.sessionNotes)
    .values({ sessionId, exerciseId, note })
    .onConflictDoUpdate({
      target: [schema.sessionNotes.sessionId, schema.sessionNotes.exerciseId],
      set: { note },
    });
}

export async function writeFinish(
  session: typeof schema.sessions.$inferSelect,
  finishedAtMs?: number,
) {
  const db = await getDb();
  if (!session.finishedAt) {
    await db
      .update(schema.sessions)
      .set({ finishedAt: clampFinishedAt(finishedAtMs, session.startedAt) })
      .where(eq(schema.sessions.id, session.id));
  }
  const day = await db.query.days.findFirst({ where: eq(schema.days.id, session.dayId) });
  if (day) {
    revalidatePath(`/workouts/${day.programId}/days/${session.dayId}`);
    revalidatePath("/workouts");
  }
}

/**
 * Apply one queued write. Used only by the outbox route — the actions call the
 * functions above directly, since they already know which one they want.
 */
export async function applyOp(op: OutboxOp, userId: string): Promise<void> {
  const session = await ownedSession(op.sessionId, userId);
  switch (op.kind) {
    case "log":
      return writeSet(session.id, op);
    case "skip":
      return writeSkips(session.id, op.sets);
    case "unskip":
      return removeSkips(session.id, op.exerciseId);
    case "note":
      return writeNote(session.id, op.exerciseId, op.note);
    case "finish":
      return writeFinish(session, op.finishedAtMs);
  }
}
