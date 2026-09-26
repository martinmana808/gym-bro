import fs from "node:fs";
import path from "node:path";
import { workoutFighter } from "@/lib/avatar";

const AVATAR_DIR = path.join(process.cwd(), "public", "avatars");
const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * Which slugs actually have artwork, read once at module load. Checking on the
 * server means a missing file falls back to the monogram cleanly, with no
 * broken-image flash in the browser.
 */
const portraits: Map<string, string> = (() => {
  const found = new Map<string, string>();
  try {
    for (const file of fs.readdirSync(AVATAR_DIR)) {
      const ext = path.extname(file).toLowerCase();
      if (EXTENSIONS.includes(ext)) found.set(path.basename(file, ext), `/avatars/${file}`);
    }
  } catch {
    // no folder yet — monograms all round
  }
  return found;
})();

/** The fighter assigned to a workout: their portrait, or their monogram. */
export function WorkoutAvatar({
  id,
  name,
  size = 44,
}: {
  id: string;
  name: string;
  size?: number;
}) {
  const fighter = workoutFighter(id);
  const src = portraits.get(fighter.slug);
  return (
    <span
      title={`${name} · ${fighter.name}`}
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-xl border"
      style={{
        width: size,
        height: size,
        background: fighter.background,
        borderColor: fighter.border,
      }}
    >
      {src ? (
        /* A 44px static file we already sized — next/image would add a loader
           and a cost for no benefit. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={fighter.name}
          width={size}
          height={size}
          className="size-full object-cover"
        />
      ) : (
        <span
          aria-label={fighter.name}
          className="font-bold tracking-tight"
          style={{ color: fighter.ink, fontSize: size * 0.38 }}
        >
          {fighter.initials}
        </span>
      )}
    </span>
  );
}
