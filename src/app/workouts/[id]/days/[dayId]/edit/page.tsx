import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getDayCellVariationId, getVariationStructure, listDayVariations } from "@/db/queries";
import { deriveWeeks } from "@/lib/weeks";
import { WorkoutBuilder } from "@/components/WorkoutBuilder";
import { WeekTabs } from "@/components/WeekTabs";

export const dynamic = "force-dynamic";

export default async function EditCellPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; dayId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { id: programId, dayId } = await params;
  const { week } = await searchParams;
  const userId = await requireUserId();

  const dayVariations = await listDayVariations(dayId, userId);
  if (!dayVariations.length) notFound();
  const weeks = deriveWeeks([dayVariations.map((v) => ({ position: v.position, name: v.name }))]);
  const wanted = week != null && week !== "" ? Number(week) : undefined;
  const selectedWeek =
    wanted != null && weeks.some((w) => w.position === wanted) ? wanted : weeks[weeks.length - 1].position;

  const cellVariationId = await getDayCellVariationId(dayId, selectedWeek, userId);
  if (!cellVariationId) notFound();
  const structure = await getVariationStructure(cellVariationId, userId);
  if (!structure) notFound();
  const { workout, blocks } = structure;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link
          href={`/workouts/${programId}/days/${dayId}?week=${selectedWeek}`}
          aria-label="Back to day"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900/80 text-lg text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          ←
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Edit day</h1>
          <p className="truncate text-sm text-zinc-400">
            {workout.name} · <span className="text-lime-400">{weeks.find((w) => w.position === selectedWeek)?.name}</span>
          </p>
        </div>
      </header>

      <WeekTabs
        programId={programId}
        weeks={weeks}
        selectedWeek={selectedWeek}
        basePath={`/workouts/${programId}/days/${dayId}/edit`}
      />

      <WorkoutBuilder
        variationId={cellVariationId}
        initial={{
          name: workout.name,
          defaultRestSeconds: workout.defaultRestSeconds,
          blocks: blocks.map((b) => ({
            id: b.id,
            sectionName: b.exercises[0]?.sectionName ?? null,
            exercises: b.exercises.map((e) => ({
              id: e.id,
              name: e.name,
              sets: e.sets,
              measurement: e.measurement,
              repScheme: e.repScheme,
              repsMin: e.repsMin,
              repsMax: e.repsMax,
              timeSeconds: e.timeSeconds,
              restOverrideSeconds: e.restOverrideSeconds,
              note: e.note,
              weightUnit: e.weightUnit,
              targetWeight: e.targetWeight,
            })),
          })),
        }}
      />
    </main>
  );
}
