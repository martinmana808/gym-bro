import Link from "next/link";
import { requireUserId } from "@/auth";
import { ImportWizard } from "@/components/ImportWizard";

export default async function ImportPage() {
  await requireUserId();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link
          href="/workouts"
          aria-label="Back to workouts"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-lg text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-900"
        >
          ←
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Import spreadsheet</h1>
      </header>
      <ImportWizard />
    </main>
  );
}
