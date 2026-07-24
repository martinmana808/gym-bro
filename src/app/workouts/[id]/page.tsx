import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getProgramHub } from "@/db/queries";
import { deleteProgram } from "@/app/actions";
import { WeekTabs } from "@/components/WeekTabs";
import { DaysList } from "@/components/DaysList";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";

export const dynamic = "force-dynamic";

export default async function WorkoutHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { id } = await params;
  const { week } = await searchParams;
  const userId = await requireUserId();
  const weekParam = week != null && week !== "" ? Number(week) : undefined;
  const hub = await getProgramHub(id, userId, Number.isFinite(weekParam) ? weekParam : undefined);
  if (!hub) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <Link
          href="/workouts"
          aria-label="Back to workouts"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900/80 text-lg text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          ←
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{hub.program.name}</h1>
          <p className="text-sm text-zinc-400">
            {hub.days.length} day{hub.days.length === 1 ? "" : "s"} · {hub.weeks.length} week
            {hub.weeks.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <WeekTabs
        programId={hub.program.id}
        weeks={hub.weeks}
        selectedWeek={hub.selectedWeek}
        basePath={`/workouts/${hub.program.id}`}
      />

      <DaysList programId={hub.program.id} selectedWeek={hub.selectedWeek} days={hub.days} />

      <form action={deleteProgram.bind(null, hub.program.id)} className="mt-4 text-center">
        <ConfirmSubmit
          message={`Delete the whole "${hub.program.name}" workout — every day, week and session? This cannot be undone.`}
          className="text-sm text-zinc-600 transition hover:text-red-400"
        >
          Delete workout
        </ConfirmSubmit>
      </form>
    </main>
  );
}
