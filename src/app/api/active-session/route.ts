import { auth } from "@/auth";
import { getActiveSession } from "@/db/queries";

export const dynamic = "force-dynamic";

/** Feeds the bottom "session in progress" bar. Returns null when idle. */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json(null);
  return Response.json(await getActiveSession(userId));
}
