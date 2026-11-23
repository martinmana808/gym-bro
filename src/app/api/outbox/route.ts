import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/db";
import { applyOp, ownedSession, WriteRejected } from "@/db/sessionWrites";
import { parseQueue, type OutboxEntry, type OutboxFailure } from "@/lib/outbox";

export const dynamic = "force-dynamic";

/**
 * Drains a phone's outbox: the sets, skips, notes and finish it recorded while
 * it had no signal.
 *
 * A route handler rather than a server action, because the answer's shape is
 * the point. A thrown `fetch` means the network is down and nothing should be
 * discarded; an HTTP response means the server was reached and can say, per
 * entry, whether retrying could ever help. A server action collapses both into
 * one indistinguishable rejection.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let entries: OutboxEntry[] = [];
  try {
    const body = (await request.json()) as { entries?: unknown };
    // Same validator the client stores through, so a mangled queue is rejected
    // here too rather than reaching the database.
    entries = parseQueue(JSON.stringify(body.entries ?? []));
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!entries.length) return Response.json({ applied: [], failed: [] });

  const applied: string[] = [];
  const failed: OutboxFailure[] = [];
  // Which exercise ids each session is actually allowed to log against. A queue
  // can sit on a phone for days, so what comes back is checked, not trusted.
  const allowed = new Map<string, Set<string>>();

  for (const entry of entries) {
    try {
      await assertExercisesBelong(entry, userId, allowed);
      await applyOp(entry.op, userId);
      applied.push(entry.id);
    } catch (e) {
      const permanent = e instanceof WriteRejected;
      failed.push({
        id: entry.id,
        permanent,
        message: e instanceof Error ? e.message : "Upload failed",
      });
      // A permanent failure is dropped by the client, so the rest of the batch
      // can go. Anything else means the server is in trouble: stop, and leave
      // the queue in order for the next try.
      if (!permanent) break;
    }
  }

  return Response.json({ applied, failed });
}

/** Throws `WriteRejected` if an op names an exercise outside its session. */
async function assertExercisesBelong(
  entry: OutboxEntry,
  userId: string,
  cache: Map<string, Set<string>>,
) {
  const { op } = entry;
  const ids =
    op.kind === "log"
      ? [op.exerciseId]
      : op.kind === "note"
        ? [op.exerciseId]
        : op.kind === "skip"
          ? op.sets.map((s) => s.exerciseId)
          : op.kind === "unskip" && op.exerciseId
            ? [op.exerciseId]
            : [];
  if (!ids.length) return;

  let valid = cache.get(op.sessionId);
  if (!valid) {
    const owned = await ownedSession(op.sessionId, userId);
    const db = await getDb();
    const rows = await db.query.exercises.findMany({
      where: eq(schema.exercises.variationId, owned.variationId),
      columns: { id: true },
    });
    valid = new Set(rows.map((r) => r.id));
    cache.set(op.sessionId, valid);
  }
  for (const id of ids) {
    if (!valid.has(id)) throw new WriteRejected("That exercise is not part of this workout");
  }
}
