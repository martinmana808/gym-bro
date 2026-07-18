import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
// Dev login is on outside production. It can also be force-enabled in a
// production build via ALLOW_DEV_LOGIN=true — useful for a personal single-user
// deployment or running a local production server for phone access on your LAN.
export const hasDevLogin =
  process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_LOGIN === "true";

const providers: NextAuthConfig["providers"] = [];
if (hasGoogle) providers.push(Google);
if (hasDevLogin) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev Login",
      credentials: {},
      authorize: async () => ({ email: "dev@localhost", name: "Dev User" }),
    }),
  );
}

async function upsertUser(email: string, name?: string | null, image?: string | null) {
  const db = await getDb();
  const [row] = await db
    .insert(schema.users)
    .values({ email, name, image })
    .onConflictDoUpdate({
      target: schema.users.email,
      set: { name: name ?? undefined, image: image ?? undefined },
    })
    .returning({ id: schema.users.id });
  if (row) return row.id;
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  return existing!.id;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/signin" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        token.uid = await upsertUser(user.email, user.name, user.image);
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});

/** Returns the signed-in user's internal id or redirects to /signin. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) {
    const { redirect } = await import("next/navigation");
    redirect("/signin");
  }
  return uid as string;
}
