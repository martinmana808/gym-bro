import { workoutAvatar } from "@/lib/avatar";

/** The generated tile for a workout — same one every time, from its id. */
export function WorkoutAvatar({
  id,
  name,
  size = 44,
}: {
  id: string;
  name: string;
  size?: number;
}) {
  const a = workoutAvatar(id, name);
  return (
    <span
      aria-hidden
      title={name}
      className="grid shrink-0 place-items-center rounded-xl border"
      style={{
        width: size,
        height: size,
        background: a.background,
        borderColor: a.border,
        fontSize: size * 0.48,
        lineHeight: 1,
      }}
    >
      {a.glyph}
    </span>
  );
}
