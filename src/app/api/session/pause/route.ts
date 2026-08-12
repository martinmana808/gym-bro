import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Pause / resume a running session.
 *
 * Pausing banks nothing yet — it just stamps `paused_at`. Resuming adds the
 * paused stretch to `paused_ms` and, if a rest was running, pushes
 * `rest_ends_at` forward by the same amount so the countdown picks up exactly
 * where it left off rather than having silently expired.
 *
 * The caller re-arms the rest push on resume; while paused there must be no
 * pending push, so this drops it.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let body: { sessionId?: string; paused?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!body.sessionId) return new Response("Bad request", { status: 400 });

  const db = await getDb();
  const row = await db.query.sessions.findFirst({
    where: and(eq(schema.sessions.id, body.sessionId), eq(schema.sessions.userId, userId)),
  });
  if (!row) return new Response("Not found", { status: 404 });

  const now = Date.now();

  if (body.paused) {
    if (!row.pausedAt) {
      await db
        .update(schema.sessions)
        .set({ pausedAt: new Date(now) })
        .where(eq(schema.sessions.id, row.id));
    }
    // No notification should land while paused.
    await db.delete(schema.restAlerts).where(eq(schema.restAlerts.userId, userId));
    return Response.json({ ok: true, paused: true, restEndsAtMs: null });
  }

  if (!row.pausedAt) {
    return Response.json({
      ok: true,
      paused: false,
      restEndsAtMs: row.restEndsAt ? row.restEndsAt.getTime() : null,
    });
  }

  const pausedFor = Math.max(0, now - row.pausedAt.getTime());
  const restEndsAt = row.restEndsAt ? new Date(row.restEndsAt.getTime() + pausedFor) : null;
  await db
    .update(schema.sessions)
    .set({ pausedAt: null, pausedMs: row.pausedMs + pausedFor, restEndsAt })
    .where(eq(schema.sessions.id, row.id));

  return Response.json({
    ok: true,
    paused: false,
    restEndsAtMs: restEndsAt ? restEndsAt.getTime() : null,
  });
}
