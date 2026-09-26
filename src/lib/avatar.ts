// A workout's avatar: one of the roster below, picked from a hash of the
// workout's id so it's stable forever and costs no storage.
//
// The artwork itself lives in `public/avatars/<slug>.<ext>` and is NOT in the
// repo — see that folder's README. When a file is missing the monogram shows
// instead, so the app looks finished either way.

/** FNV-1a — small, fast, and spreads short ids well across buckets. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Fighter = {
  slug: string;
  name: string;
  initials: string;
  /** Background for the monogram, and the tint behind a portrait. */
  background: string;
  border: string;
  ink: string;
};

/** Colours picked from each one's most recognisable palette. */
export const ROSTER: Fighter[] = [
  {
    slug: "arnold",
    name: "Arnold Schwarzenegger",
    initials: "AS",
    background: "linear-gradient(135deg, #b8862b, #5a3d12)",
    border: "#d9a441",
    ink: "#ffe9b8",
  },
  {
    slug: "rambo",
    name: "Rambo",
    initials: "RA",
    background: "linear-gradient(135deg, #4a5133, #22261a)",
    border: "#7c874f",
    ink: "#e3e8cf",
  },
  {
    slug: "rocky",
    name: "Rocky Balboa",
    initials: "RB",
    background: "linear-gradient(135deg, #6e2233, #2a1017)",
    border: "#a83950",
    ink: "#ffd9e0",
  },
  {
    slug: "goggins",
    name: "David Goggins",
    initials: "DG",
    background: "linear-gradient(135deg, #2b2b2b, #0a0a0a)",
    border: "#ff6b1a",
    ink: "#ff8c42",
  },
  {
    slug: "chadd-wright",
    name: "Chadd Wright",
    initials: "CW",
    background: "linear-gradient(135deg, #1d3a5c, #0b1723)",
    border: "#3f7cb5",
    ink: "#cfe3f7",
  },
  {
    slug: "bruce-lee",
    name: "Bruce Lee",
    initials: "BL",
    background: "linear-gradient(135deg, #d4a017, #3b2c05)",
    border: "#ffd54f",
    ink: "#fff3c4",
  },
  {
    slug: "drago",
    name: "Ivan Drago",
    initials: "ID",
    background: "linear-gradient(135deg, #2f5f7a, #0d1c25)",
    border: "#7fc4e8",
    ink: "#dff2ff",
  },
  {
    slug: "mr-t",
    name: "Mr T",
    initials: "MT",
    background: "linear-gradient(135deg, #8a1b1b, #2a0808)",
    border: "#f2c14e",
    ink: "#ffe08a",
  },
  {
    slug: "apollo-creed",
    name: "Apollo Creed",
    initials: "AC",
    background: "linear-gradient(135deg, #1b3a8a, #7a1020)",
    border: "#e8e8e8",
    ink: "#ffffff",
  },
];

/** The fighter assigned to a workout. Same id always gets the same one. */
export function workoutFighter(seed: string): Fighter {
  return ROSTER[hash(seed || "gym-bro") % ROSTER.length];
}
