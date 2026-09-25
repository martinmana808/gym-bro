// A workout's avatar. Generated from its id, so it's stable forever, costs no
// storage, needs no upload, and every workout looks different from the next.

/** FNV-1a — small, fast, and spreads short ids well across buckets. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hues picked to stay legible on near-black, and to read as distinct pairs. */
const HUES = [78, 96, 150, 172, 190, 205, 250, 275, 300, 330, 350, 25, 42, 58];
const GLYPHS = ["🏋️", "💪", "🔥", "⚡", "🦍", "🐻", "🥊", "🛡️", "🚀", "⛰️", "🦅", "🧨"];

export type WorkoutAvatar = {
  /** CSS gradient for the tile background. */
  background: string;
  /** Border colour that sits on top of that gradient. */
  border: string;
  glyph: string;
  /** Two-letter fallback drawn under the glyph for screen readers. */
  initials: string;
};

/**
 * Deterministic avatar for a workout. Two hues a fixed distance apart give a
 * gradient that always has contrast, and the glyph comes from the same hash so
 * the pairing is stable.
 */
export function workoutAvatar(seed: string, name = ""): WorkoutAvatar {
  const h = hash(seed || name || "gym-bro");
  const hue = HUES[h % HUES.length];
  const hue2 = HUES[(h >>> 8) % HUES.length];
  const angle = 115 + ((h >>> 16) % 130);
  return {
    background: `linear-gradient(${angle}deg, oklch(0.42 0.13 ${hue}), oklch(0.26 0.09 ${hue2}))`,
    border: `oklch(0.62 0.15 ${hue} / 0.55)`,
    glyph: GLYPHS[(h >>> 4) % GLYPHS.length],
    initials: initialsOf(name),
  };
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
