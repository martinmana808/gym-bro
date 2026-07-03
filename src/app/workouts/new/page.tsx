import Link from "next/link";
import { requireUserId } from "@/auth";
import { WorkoutBuilder } from "@/components/WorkoutBuilder";

export default async function NewWorkoutPage() {
  await requireUserId();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link href="/workouts" className="text-zinc-500 hover:text-zinc-300">
          ←
        </Link>
        <h1 className="text-2xl font-bold">New workout</h1>
      </header>
      <WorkoutBuilder />
    </main>
  );
}
