import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getProgramHub } from "@/db/queries";
import { deleteProgram } from "@/app/actions";
import { WeekTabs } from "@/components/WeekTabs";
import { DaysList } from "@/components/DaysList";
import { HubActions } from "@/components/HubActions";
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-6">
      <header className="flex items-center gap-3">
        <Link
          href="/workouts"
          aria-label="Back to workouts"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-lg text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-900"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{hub.program.name}</h1>
        </div>
        <HubActions programId={hub.program.id} name={hub.program.name} />
      </header>

      <WeekTabs
        programId={hub.program.id}
        weeks={hub.weeks}
        selectedWeek={hub.selectedWeek}
        basePath={`/workouts/${hub.program.id}`}
      />

      <DaysList
        programId={hub.program.id}
        selectedWeek={hub.selectedWeek}
        days={hub.days}
        lastDoneDayId={hub.lastDoneDayId}
      />

      <Link
        href={`/workouts/${hub.program.id}/sheet`}
        className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-center text-sm font-medium text-zinc-600 transition hover:border-zinc-300"
      >
        📊 Spreadsheet view — all weeks &amp; sessions
      </Link>

      <form action={deleteProgram.bind(null, hub.program.id)} className="mt-2 text-center">
        <ConfirmSubmit
          message={`Delete the whole "${hub.program.name}" workout — every day, week and session? This cannot be undone.`}
          className="text-sm text-zinc-400 transition hover:text-red-600"
        >
          Delete workout
        </ConfirmSubmit>
      </form>
    </main>
  );
}
