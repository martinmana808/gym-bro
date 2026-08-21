import Link from "next/link";
import { auth, signOut } from "@/auth";
import { NotificationSettings } from "@/components/NotificationSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-lime-600">🏋️ Gym Bro</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Settings</h1>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold tracking-tight">Account</h2>
        <p className="mt-1 truncate text-sm text-zinc-500">
          {user?.email ?? user?.name ?? "Not signed in"}
        </p>
        {user ? (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
            className="mt-3"
          >
            <button className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-400">
              Sign out
            </button>
          </form>
        ) : (
          <Link
            href="/signin"
            className="mt-3 inline-block rounded-xl bg-lime-400 px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-lime-300"
          >
            Sign in
          </Link>
        )}
      </section>

      <NotificationSettings />

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold tracking-tight">Your data</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Bring a plan in from a spreadsheet, or take every logged set with you.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/import"
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-400"
          >
            Import spreadsheet
          </Link>
          <a
            href="/api/export"
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-400"
          >
            Export CSV
          </a>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold tracking-tight">Help</h2>
        <dl className="mt-3 flex flex-col gap-3 text-sm">
          <div>
            <dt className="font-medium">Put Gym Bro on your home screen</dt>
            <dd className="mt-0.5 text-zinc-500">
              Open the app in Safari, tap <span className="text-zinc-700">Share ⎋</span> →{" "}
              <span className="text-zinc-700">Add to Home Screen</span>. Notifications only work
              once it&apos;s installed.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Notifications stopped arriving</dt>
            <dd className="mt-0.5 text-zinc-500">
              iOS quietly expires them every week or two. Turn the toggle above off and on again.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Weeks</dt>
            <dd className="mt-0.5 text-zinc-500">
              A workout has days; each day has a version per week. The first week owns the exercise
              list — later weeks only change sets, weight and reps.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Supersets</dt>
            <dd className="mt-0.5 text-zinc-500">
              Exercises grouped in one card are done back to back; rest comes after the round, not
              between them.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Rest timer</dt>
            <dd className="mt-0.5 text-zinc-500">
              It runs on the server, so it survives closing the app. Pausing a workout pauses it
              too.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
