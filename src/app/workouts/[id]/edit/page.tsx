import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getVariationStructure, listDayVariations } from "@/db/queries";
import { WorkoutBuilder } from "@/components/WorkoutBuilder";

export const dynamic = "force-dynamic";

export default async function EditWorkoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;
  const userId = await requireUserId();
  const variations = await listDayVariations(id, userId);
  const variationId =
    (v && variations.some((va) => va.id === v) ? v : undefined) ?? variations[0]?.id;
  if (!variationId) notFound();
  const structure = await getVariationStructure(variationId, userId);
  if (!structure) notFound();
  const { workout, blocks } = structure;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link
          href={`/workouts/${workout.id}?v=${variationId}`}
          aria-label="Back to workout"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900/80 text-lg text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
        >
          ←
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Edit workout</h1>
      </header>
      <WorkoutBuilder
        variationId={variationId}
        initial={{
          name: workout.name,
          defaultRestSeconds: workout.defaultRestSeconds,
          blocks: blocks.map((b) => ({
            id: b.id,
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
            })),
          })),
        }}
      />
    </main>
  );
}
