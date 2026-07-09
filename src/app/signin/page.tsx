import { redirect } from "next/navigation";
import { auth, hasDevLogin, hasGoogle, signIn } from "@/auth";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/workouts");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-10 px-6">
      <div className="text-center">
        <p className="text-6xl">🏋️</p>
        <h1 className="mt-5 text-5xl font-black tracking-tight">
          Gym <span className="text-lime-400">Bro</span>
        </h1>
        <p className="mt-3 text-lg text-zinc-400">Your workout routine, tracked set by set.</p>
      </div>

      <div className="flex w-full flex-col gap-3">
        {hasGoogle && (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/workouts" });
            }}
          >
            <button className="w-full rounded-2xl bg-zinc-100 py-3.5 font-bold text-zinc-950 transition hover:bg-white active:scale-[0.98]">
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
            <button className="w-full rounded-2xl border border-zinc-700 py-3.5 font-semibold text-zinc-200 transition hover:border-lime-400 hover:text-lime-400 active:scale-[0.98]">
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
