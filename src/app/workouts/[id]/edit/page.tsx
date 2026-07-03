import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getWorkoutStructure } from "@/db/queries";
import { WorkoutBuilder } from "@/components/WorkoutBuilder";

export const dynamic = "force-dynamic";

export default async function EditWorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const structure = await getWorkoutStructure(id, userId);
  if (!structure) notFound();
  const { workout, blocks } = structure;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link href={`/workouts/${workout.id}`} className="text-zinc-500 hover:text-zinc-300">
          ←
        </Link>
        <h1 className="text-2xl font-bold">Edit workout</h1>
      </header>
      <WorkoutBuilder
        workoutId={workout.id}
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
            })),
          })),
        }}
      />
    </main>
  );
}
