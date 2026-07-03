import { redirect } from "next/navigation";
import { auth, hasDevLogin, hasGoogle, signIn } from "@/auth";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/workouts");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <p className="text-5xl">🏋️</p>
        <h1 className="mt-4 text-4xl font-bold">Gym Bro</h1>
        <p className="mt-2 text-zinc-400">Your workout routine, tracked set by set.</p>
      </div>

      <div className="flex w-full flex-col gap-3">
        {hasGoogle && (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/workouts" });
            }}
          >
            <button className="w-full rounded-xl bg-zinc-100 py-3 font-semibold text-zinc-950 hover:bg-white">
              Continue with Google
            </button>
          </form>
        )}
        {hasDevLogin && (
          <form
            action={async () => {
              "use server";
              await signIn("dev", { redirectTo: "/workouts" });
            }}
          >
            <button className="w-full rounded-xl border border-zinc-700 py-3 font-semibold text-zinc-200 hover:border-lime-400 hover:text-lime-400">
              Dev login (local only)
            </button>
          </form>
        )}
        {!hasGoogle && !hasDevLogin && (
          <p className="text-center text-sm text-zinc-500">
            No sign-in method is configured. Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.
          </p>
        )}
      </div>
    </main>
  );
}
