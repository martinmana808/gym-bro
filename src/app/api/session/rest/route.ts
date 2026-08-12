import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/db";
import { sendPushToUser, pushEnabled } from "@/lib/push";
import { clampRestSeconds, restNotification } from "@/lib/restPush";

export const dynamic = "force-dynamic";
// The request sleeps out the rest timer, so it needs the full function budget.
export const maxDuration = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Only touch sessions this user owns and hasn't finished. */
async function ownedOpenSession(sessionId: string, userId: string) {
  const db = await getDb();
  return db.query.sessions.findFirst({
    where: and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)),
  });
}

/**
 * "Rest started." Two jobs, one call:
 *
 *  1. Persist `sessions.rest_ends_at`, so the countdown survives navigation,
 *     reload and app restarts, and the bottom bar can render it anywhere.
 *  2. Schedule the "rest over" push. iOS has no local notification scheduling
 *     and freezes a backgrounded PWA's timers, so the server holds the timer:
 *     we answer immediately, then sleep in `after()` and push when it elapses.
 *
 * Only the newest schedule per user wins — the rest_alerts token is replaced by
 * every new call and a sleeper whose token is gone exits quietly. That is what
 * makes "skip rest", "+30s" and "logged the next set early" cancel the push.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let payload: { seconds?: number; nextExercise?: string; sessionId?: string } = {};
  try {
    payload = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const seconds = clampRestSeconds(payload.seconds ?? 0);
  const endsAt = new Date(Date.now() + seconds * 1000);
  const db = await getDb();

  if (payload.sessionId) {
    const owned = await ownedOpenSession(payload.sessionId, userId);
    if (!owned) return new Response("Not found", { status: 404 });
    await db
      .update(schema.sessions)
      .set({ restEndsAt: endsAt })
      .where(eq(schema.sessions.id, payload.sessionId));
  }

  // Push is optional: with no VAPID keys the rest timer still persists.
  if (!pushEnabled()) return Response.json({ ok: true, seconds, push: false });

  const token = crypto.randomUUID();
  const note = restNotification(payload.nextExercise ?? null, payload.sessionId ?? null);
  await db
    .insert(schema.restAlerts)
    .values({ userId, token, fireAt: endsAt, sessionId: payload.sessionId ?? null, body: note.body })
    .onConflictDoUpdate({
      target: schema.restAlerts.userId,
      set: { token, fireAt: endsAt, sessionId: payload.sessionId ?? null, body: note.body },
    });

  after(async () => {
    await sleep(seconds * 1000);
    const db2 = await getDb();
    const row = await db2.query.restAlerts.findFirst({
      where: eq(schema.restAlerts.userId, userId),
    });
    if (!row || row.token !== token) return; // superseded or cancelled
    await db2.delete(schema.restAlerts).where(eq(schema.restAlerts.token, token));
    await sendPushToUser(userId, note);
  });

  return Response.json({ ok: true, token, seconds, push: true });
}

/** "Rest is over or abandoned" — skip rest, next set, finish, discard. */
export async function DELETE(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let sessionId = "";
  try {
    sessionId = String(((await request.json()) as { sessionId?: string }).sessionId ?? "");
  } catch {
    // no body — just drop the pending push
  }

  const db = await getDb();
  if (sessionId) {
    await db
      .update(schema.sessions)
      .set({ restEndsAt: null })
      .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)));
  }
  await db.delete(schema.restAlerts).where(eq(schema.restAlerts.userId, userId));
  return Response.json({ ok: true });
}
