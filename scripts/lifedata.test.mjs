import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendBlocks,
  blockFor,
  doneLines,
  load,
  setLines,
  targetOf,
  kg,
  muscleFields,
  blocksToAppend,
  dayStart,
  lastBlockFor,
  lifeDate,
  localTime,
  minutesOf,
  parseBlocks,
  percent,
  recentDays,
  sessionFields,
  skipLines,
} from "./lifedata.mjs";

// Buenos Aires is UTC-3, so 23:00Z is 20:00 the same evening.
const at = (iso) => new Date(iso);

const session = (over = {}) => ({
  program: "Pequeño Putarraco",
  day: "Day 2",
  startedAt: at("2026-11-12T23:58:59Z"), // 20:58 in Buenos Aires
  endedAt: at("2026-11-13T00:55:49Z"), // 21:55
  pausedMs: 0,
  finished: true,
  logged: 23,
  planned: 26,
  reps: 262,
  volume: 8280.5,
  exercises: [],
  ...over,
});

// The divider he writes above a group of exercises in the app, exactly as his
// own programme has them. "Cinta de correr" sits under none on purpose.
const SECTIONS = {
  "Press plano": "Pecho",
  "Peck deck": "Pecho",
  "Remo alto": "Espalda",
  "Dominadas neutras": "Espalda",
  "Vuelos laterales": "Hombros",
  "Face pulls": "Hombros",
  "Sentadillas libres": "Piernas",
  "Camilla de isquio": "Piernas",
  "Sillon de abductores (abrir)": "Piernas",
};

const ex = (name, sets, logged, over = {}) => ({
  name,
  section: SECTIONS[name] ?? null,
  sets,
  logged,
  reps: logged * 10,
  volume: logged * 100,
  unit: "kg",
  maxWeight: 20,
  measurement: "reps",
  repScheme: "fixed",
  repsMin: 10,
  repsMax: null,
  planTimeSeconds: null,
  targetWeight: null,
  note: null,
  sets_: [],
  ...over,
});

// A logged row, as set_logs holds it.
const set = (setNumber, over = {}) => ({
  setNumber,
  weight: 40,
  reps: 10,
  timeSeconds: null,
  hitTarget: false,
  skipped: false,
  loggedAt: at("2026-11-12T23:00:00Z"), // 20:00
  ...over,
});

describe("the 04:00 day", () => {
  it("puts a workout after midnight on the day before", () => {
    expect(lifeDate(at("2026-11-13T04:00:00Z"))).toBe("2026-11-12"); // 01:00 local
    expect(lifeDate(at("2026-11-13T06:59:00Z"))).toBe("2026-11-12"); // 03:59 local
  });

  it("starts the new day at 04:00 local", () => {
    expect(lifeDate(at("2026-11-13T07:00:00Z"))).toBe("2026-11-13"); // 04:00 local
    expect(lifeDate(at("2026-11-13T08:00:00Z"))).toBe("2026-11-13"); // 05:00 local
  });

  it("keeps an evening workout on its own date", () => {
    expect(lifeDate(at("2026-11-12T23:58:59Z"))).toBe("2026-11-12");
  });

  it("reports the real wall clock, not the shifted one", () => {
    expect(localTime(at("2026-11-12T23:58:59Z"))).toBe("20:58");
    expect(localTime(at("2026-11-13T04:00:00Z"))).toBe("01:00");
  });

  it("knows when a day begins", () => {
    expect(dayStart("2026-11-13").toISOString()).toBe("2026-11-13T07:00:00.000Z");
  });

  it("never offers to write the day that is still open", () => {
    // 12:00 in Buenos Aires on the 24th: the 24th is still being lived.
    const days = recentDays(at("2026-11-24T15:00:00Z"), 8);
    expect(days).toEqual([
      "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19",
      "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23",
    ]);
  });

  it("counts the early hours as still yesterday when it runs at 04:05", () => {
    // 04:05 on the 24th closes the 23rd, which is the day it must write.
    const days = recentDays(at("2026-11-24T07:05:00Z"), 1);
    expect(days).toEqual(["2026-11-23"]);
  });
});

describe("the summary line", () => {
  it("uses Martin's fields, in his order", () => {
    expect(sessionFields(session({ exercises: [ex("Remo alto", 3, 3)] }))).toEqual([
      "workout: Pequeño Putarraco",
      "day: Day 2",
      "at: 20:58",
      "duration: 57min",
      "done: 88%",
      "sets: 23/26",
      "reps: 262",
      "volume: 8,281kg",
      "muscles: Espalda",
      "ended: 21:55",
    ]);
  });

  it("groups kilos the way he writes them", () => {
    expect(kg(8450)).toBe("8,450kg");
    expect(kg(1957.5)).toBe("1,958kg");
    expect(kg(0)).toBe("0kg");
    expect(kg(null)).toBe("0kg");
  });

  it("does not count paused time as training", () => {
    const fields = sessionFields(session({ pausedMs: 10 * 60_000 }));
    expect(fields).toContain("duration: 47min");
  });

  it("says so when the session was never finished", () => {
    expect(sessionFields(session({ finished: false }))).toContain("status: unfinished");
    expect(sessionFields(session())).not.toContain("status: unfinished");
  });

  it("rounds completion the way his example does", () => {
    expect(percent(16, 18)).toBe(89);
    expect(percent(27, 27)).toBe(100);
  });

  it("never divides by a plan with nothing in it", () => {
    expect(percent(0, 0)).toBe(0);
  });

  it("rounds a duration to the nearest minute and never goes negative", () => {
    expect(minutesOf(3_810_000)).toBe(64);
    expect(minutesOf(-5)).toBe(0);
  });
});

describe("the skipped lines", () => {
  it("names an exercise that got nothing at all", () => {
    expect(skipLines([ex("Face pulls", 3, 0)])).toEqual(["skipped exercise: Face pulls (3 sets)"]);
  });

  it("counts the sets missing from one that got some", () => {
    expect(skipLines([ex("Lateral raise", 4, 2)])).toEqual(["skipped sets: Lateral raise 2 of 4"]);
  });

  it("says one set, not one sets", () => {
    expect(skipLines([ex("Plancha", 1, 0)])).toEqual(["skipped exercise: Plancha (1 set)"]);
  });

  it("stays quiet about an exercise that was done in full", () => {
    expect(skipLines([ex("Remo alto", 3, 3)])).toEqual([]);
  });

  it("ignores extra sets logged beyond the plan", () => {
    expect(skipLines([ex("Remo alto", 3, 4)])).toEqual([]);
  });
});

describe("the done lines", () => {
  const line = (e) => doneLines([e])[0].line;

  it("gives an exercise its sets, reps and kilos", () => {
    expect(line(ex("Remo alto", 3, 3, { reps: 27, volume: 1957.5 }))).toBe(
      "done: Remo alto · 3 sets · 27 reps · 1,958kg · target: 3 × 10 reps",
    );
  });

  it("says one set, not one sets", () => {
    expect(line(ex("Plancha", 1, 1, { reps: 8, volume: 0, repsMin: 8 }))).toBe(
      "done: Plancha · 1 set · 8 reps · 0kg · target: 1 × 8 reps",
    );
  });

  it("leaves a bodyweight exercise at zero kilos, with nothing else to say", () => {
    expect(
      line(ex("Dominadas neutras", 3, 3, { reps: 24, volume: 0, maxWeight: null, repsMin: 8 })),
    ).toBe("done: Dominadas neutras · 3 sets · 24 reps · 0kg · target: 3 × 8 reps");
  });

  it("carries the setting a machine was on when its unit is not kilos", () => {
    expect(
      line(ex("Peck deck", 3, 3, { reps: 45, volume: 0, unit: "bricks", maxWeight: 6, repsMin: 15 })),
    ).toBe("done: Peck deck · 3 sets · 45 reps · 0kg · load: 6 bricks · target: 3 × 15 reps");
  });

  it("says nothing about an exercise he never logged", () => {
    expect(doneLines([ex("Remo alto", 3, 0)])).toEqual([]);
  });
});

describe("the target the plan set", () => {
  it("reads a fixed rep count", () => {
    expect(targetOf(ex("Remo alto", 3, 3, { repsMin: 10 }))).toBe("10 reps");
  });

  it("reads a range", () => {
    expect(
      targetOf(ex("Camilla de isquio", 3, 3, { repScheme: "range", repsMin: 10, repsMax: 15 })),
    ).toBe("10–15 reps");
  });

  it("reads to failure", () => {
    expect(targetOf(ex("Remo alto", 3, 3, { repScheme: "failure", repsMin: null }))).toBe(
      "to failure",
    );
  });

  it("reads a timed exercise in seconds", () => {
    expect(
      targetOf(ex("Plancha", 3, 3, { measurement: "time", planTimeSeconds: 45 })),
    ).toBe("45s");
  });

  it("adds the target weight in the unit it was set in", () => {
    expect(targetOf(ex("Remo alto", 3, 3, { targetWeight: 45 }))).toBe("10 reps @ 45kg");
    expect(
      targetOf(ex("Peck deck", 3, 3, { unit: "bricks", targetWeight: 6 })),
    ).toBe("10 reps @ 6 bricks");
  });

  it("says nothing when the plan set nothing", () => {
    expect(targetOf(ex("Remo alto", 3, 3, { repsMin: null }))).toBeNull();
    expect(load(null, "kg")).toBeNull();
  });
});

describe("the set lines", () => {
  it("is one line per row, weight by reps, with the minute he logged it", () => {
    expect(
      setLines(ex("Remo alto", 2, 2, { sets_: [set(1), set(2, { weight: 45, reps: 8 })] })),
    ).toEqual(["set 1 · 40kg × 10 reps · 20:00", "set 2 · 45kg × 8 reps · 20:00"]);
  });

  it("leaves the weight out of a bodyweight set", () => {
    expect(setLines(ex("Dominadas neutras", 1, 1, { sets_: [set(1, { weight: null, reps: 5 })] })))
      .toEqual(["set 1 · 5 reps · 20:00"]);
  });

  it("keeps a machine's own unit", () => {
    expect(
      setLines(ex("Peck deck", 1, 1, { unit: "bricks", sets_: [set(1, { weight: 6, reps: 15 })] })),
    ).toEqual(["set 1 · 6 bricks × 15 reps · 20:00"]);
  });

  it("shows a timed set in seconds", () => {
    expect(
      setLines(ex("Plancha", 1, 1, { sets_: [set(1, { weight: null, reps: null, timeSeconds: 45 })] })),
    ).toEqual(["set 1 · 45s · 20:00"]);
  });

  it("keeps the real reps and marks the ones that hit the target", () => {
    expect(setLines(ex("Remo alto", 1, 1, { sets_: [set(1, { hitTarget: true })] }))).toEqual([
      "set 1 · 40kg × 10 reps · target hit · 20:00",
    ]);
  });

  it("says a set he tapped skip on was skipped, not that it was work", () => {
    expect(
      setLines(ex("Remo alto", 1, 1, { sets_: [set(1, { skipped: true, hitTarget: true })] })),
    ).toEqual(["set 1 · skipped · 20:00"]);
  });

  it("numbers a planned set he never reached, so you can see where he stopped", () => {
    expect(setLines(ex("Remo alto", 3, 2, { sets_: [set(1), set(2)] }))).toEqual([
      "set 1 · 40kg × 10 reps · 20:00",
      "set 2 · 40kg × 10 reps · 20:00",
      "set 3 · not logged",
    ]);
  });

  it("still lists a set logged beyond the plan", () => {
    expect(setLines(ex("Remo alto", 1, 2, { sets_: [set(1), set(2)] }))).toHaveLength(2);
  });

  it("keeps a row with no rep count as the zero it really is", () => {
    expect(setLines(ex("Camilla de isquio", 1, 1, { sets_: [set(1, { weight: 15, reps: 0 })] })))
      .toEqual(["set 1 · 15kg × 0 reps · 20:00"]);
  });

  it("puts the exercise's note last", () => {
    expect(
      setLines(ex("Sentadillas libres", 1, 1, { sets_: [set(1)], note: "Smith" })),
    ).toEqual(["set 1 · 40kg × 10 reps · 20:00", "note: Smith"]);
  });
});

describe("muscles", () => {
  it("uses his own divider, not a word of its own", () => {
    expect(muscleFields([ex("Sentadillas libres", 3, 3)])).toEqual(["muscles: Piernas"]);
  });

  it("adds up the exercises under one divider", () => {
    expect(
      muscleFields([
        ex("Vuelos laterales", 4, 4),
        ex("Remo alto", 3, 3),
        ex("Dominadas neutras", 3, 3),
      ]),
    ).toEqual(["muscles: Espalda, Hombros"]);
  });

  it("puts the busiest first", () => {
    expect(
      muscleFields([ex("Vuelos laterales", 3, 3), ex("Sentadillas libres", 9, 9)]),
    ).toEqual(["muscles: Piernas, Hombros"]);
  });

  it("breaks a tie on the order of the workout, so a re-run renders the same", () => {
    expect(muscleFields([ex("Remo alto", 3, 3), ex("Vuelos laterales", 3, 3)])).toEqual([
      "muscles: Espalda, Hombros",
    ]);
    expect(muscleFields([ex("Vuelos laterales", 3, 3), ex("Remo alto", 3, 3)])).toEqual([
      "muscles: Hombros, Espalda",
    ]);
  });

  it("counts only what he logged — a skipped exercise trained nothing", () => {
    expect(muscleFields([ex("Remo alto", 3, 3), ex("Vuelos laterales", 3, 0)])).toEqual([
      "muscles: Espalda",
    ]);
  });

  it("names an exercise sitting under no divider instead of guessing one", () => {
    expect(muscleFields([ex("Remo alto", 3, 3), ex("Cinta de correr", 2, 2)])).toEqual([
      "muscles: Espalda",
      "unmapped: Cinta de correr",
    ]);
  });

  it("treats a blank divider as no divider", () => {
    expect(muscleFields([ex("Remo alto", 3, 3, { section: "   " })])).toEqual([
      "unmapped: Remo alto",
    ]);
  });

  it("names an undivided exercise once, however many times it appears", () => {
    expect(muscleFields([ex("Cinta de correr", 1, 1), ex("Cinta de correr", 1, 1)])).toEqual([
      "unmapped: Cinta de correr",
    ]);
  });

  it("has nothing to say about a session with no logged sets", () => {
    expect(muscleFields([ex("Remo alto", 3, 0)])).toEqual([]);
  });

  it("leaves an undivided exercise he skipped alone — it distorted nothing", () => {
    expect(muscleFields([ex("Remo alto", 3, 3), ex("Cinta de correr", 2, 0)])).toEqual([
      "muscles: Espalda",
    ]);
  });
});

describe("a day's block", () => {
  it("is one summary line, then what was done, then what was not", () => {
    const block = blockFor("2026-11-12", [
      session({
        exercises: [
          ex("Dominadas neutras", 3, 0),
          ex("Remo alto", 3, 3, {
            reps: 27,
            volume: 1957.5,
            targetWeight: 45,
            sets_: [set(1), set(2, { reps: 9 }), set(3, { reps: 8 })],
          }),
        ],
      }),
    ]);
    expect(block).toBe(
      "2026-11-12 · workout: Pequeño Putarraco · day: Day 2 · at: 20:58 · duration: 57min · done: 88% · sets: 23/26 · reps: 262 · volume: 8,281kg · muscles: Espalda · ended: 21:55\n" +
        "  - done: Remo alto · 3 sets · 27 reps · 1,958kg · target: 3 × 10 reps @ 45kg\n" +
        "    - set 1 · 40kg × 10 reps · 20:00\n" +
        "    - set 2 · 40kg × 9 reps · 20:00\n" +
        "    - set 3 · 40kg × 8 reps · 20:00\n" +
        "  - skipped exercise: Dominadas neutras (3 sets)",
    );
  });

  it("is a bare summary line when there is nothing to detail", () => {
    expect(blockFor("2026-11-12", [session({ logged: 26, exercises: [] })]).split("\n")).toHaveLength(1);
  });

  it("is nothing at all on a day with no sessions", () => {
    expect(blockFor("2026-11-12", [])).toBeNull();
  });

  it("keeps two sessions in one block, totalled, with a line each", () => {
    const morning = session({
      day: "Day 1",
      startedAt: at("2026-11-12T11:00:00Z"), // 08:00
      endedAt: at("2026-11-12T11:30:00Z"),
      logged: 10,
      planned: 10,
      reps: 100,
      volume: 2000,
      exercises: [
        ex("Press plano", 2, 2, { reps: 100, volume: 2000, sets_: [set(1), set(2)] }),
      ],
    });
    const evening = session({
      day: "Day 3",
      startedAt: at("2026-11-12T23:00:00Z"), // 20:00
      endedAt: at("2026-11-12T23:40:00Z"),
      logged: 6,
      planned: 8,
      reps: 60,
      volume: 450,
      exercises: [
        ex("Vuelos laterales", 2, 2, { reps: 60, volume: 450, sets_: [set(1), set(2)] }),
        ex("Face pulls", 2, 0),
      ],
    });
    const lines = blockFor("2026-11-12", [morning, evening]).split("\n");
    expect(lines).toEqual([
      "2026-11-12 · sessions: 2 · workout: Pequeño Putarraco · day: Day 1, Day 3 · at: 08:00 · duration: 70min · done: 89% · sets: 16/18 · reps: 160 · volume: 2,450kg · muscles: Pecho, Hombros",
      "  - session 1 · workout: Pequeño Putarraco · day: Day 1 · at: 08:00 · duration: 30min · done: 100% · sets: 10/10 · reps: 100 · volume: 2,000kg · muscles: Pecho · ended: 08:30",
      "  - done: Press plano · 2 sets · 100 reps · 2,000kg · target: 2 × 10 reps",
      "    - set 1 · 40kg × 10 reps · 20:00",
      "    - set 2 · 40kg × 10 reps · 20:00",
      "  - session 2 · workout: Pequeño Putarraco · day: Day 3 · at: 20:00 · duration: 40min · done: 75% · sets: 6/8 · reps: 60 · volume: 450kg · muscles: Hombros · ended: 20:40",
      "  - done: Vuelos laterales · 2 sets · 60 reps · 450kg · target: 2 × 10 reps",
      "    - set 1 · 40kg × 10 reps · 20:00",
      "    - set 2 · 40kg × 10 reps · 20:00",
      "  - skipped exercise: Face pulls (2 sets)",
    ]);
  });

  it("indents a set under its exercise, two spaces then four", () => {
    const block = blockFor("2026-11-12", [
      session({ exercises: [ex("Remo alto", 1, 1, { sets_: [set(1)] })] }),
    ]);
    const [, exercise, oneSet] = block.split("\n");
    expect(exercise.startsWith("  - ")).toBe(true);
    expect(oneSet.startsWith("    - ")).toBe(true);
  });
});

describe("reading the file back", () => {
  const file =
    "# Gym-bro\n\n" +
    "2026-11-05 · workout: P · day: Day 1 · sets: 27/27\n" +
    "2026-11-12 · workout: P · day: Day 2 · sets: 20/26\n" +
    "  - skipped exercise: Dominadas neutras (3 sets)\n" +
    "2026-11-12 · workout: P · day: Day 2 · sets: 23/26\n";

  it("attaches detail lines to the dated line above them", () => {
    const blocks = parseBlocks(file);
    expect(blocks).toHaveLength(3);
    expect(blocks[1].text.split("\n")).toHaveLength(2);
  });

  it("ignores the heading and the blank lines", () => {
    expect(parseBlocks(file).every((b) => /^\d{4}-\d{2}-\d{2} · /.test(b.text))).toBe(true);
  });

  it("treats the last block for a date as the true one", () => {
    expect(lastBlockFor(file, "2026-11-12")).toBe(
      "2026-11-12 · workout: P · day: Day 2 · sets: 23/26",
    );
  });

  it("has nothing for a date that was never logged", () => {
    expect(lastBlockFor(file, "2026-11-06")).toBeNull();
    expect(lastBlockFor("", "2026-11-06")).toBeNull();
  });

  it("writes nothing when a day is already logged with the same data", () => {
    const same = { date: "2026-11-12", text: "2026-11-12 · workout: P · day: Day 2 · sets: 23/26" };
    expect(blocksToAppend(file, [same])).toEqual([]);
  });

  it("appends a fresh block when a day's data has since changed", () => {
    const later = { date: "2026-11-12", text: "2026-11-12 · workout: P · day: Day 2 · sets: 26/26" };
    expect(blocksToAppend(file, [later])).toEqual([later]);
  });

  it("appends a day that is not in the file yet", () => {
    const fresh = { date: "2026-11-13", text: "2026-11-13 · workout: P · day: Day 3 · sets: 9/25" };
    expect(blocksToAppend(file, [fresh, null])).toEqual([fresh]);
  });
});

describe("appending", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "lifedata-"));

  it("creates the file with its heading", () => {
    const file = path.join(tmp(), "Gym-bro.md");
    appendBlocks(file, [{ date: "2026-11-12", text: "2026-11-12 · sets: 23/26" }]);
    expect(fs.readFileSync(file, "utf8")).toBe("# Gym-bro\n\n2026-11-12 · sets: 23/26\n");
  });

  it("adds to what is there without touching it", () => {
    const file = path.join(tmp(), "Gym-bro.md");
    fs.writeFileSync(file, "# Gym-bro\n\n2026-11-05 · sets: 27/27\n");
    appendBlocks(file, [
      { date: "2026-11-12", text: "2026-11-12 · sets: 23/26\n  - skipped sets: Remo 1 of 3" },
    ]);
    expect(fs.readFileSync(file, "utf8")).toBe(
      "# Gym-bro\n\n2026-11-05 · sets: 27/27\n2026-11-12 · sets: 23/26\n  - skipped sets: Remo 1 of 3\n",
    );
  });

  it("starts a new line when the file does not end with one", () => {
    const file = path.join(tmp(), "Gym-bro.md");
    fs.writeFileSync(file, "# Gym-bro\n\n2026-11-05 · sets: 27/27");
    appendBlocks(file, [{ date: "2026-11-12", text: "2026-11-12 · sets: 23/26" }]);
    expect(fs.readFileSync(file, "utf8")).toBe(
      "# Gym-bro\n\n2026-11-05 · sets: 27/27\n2026-11-12 · sets: 23/26\n",
    );
  });

  it("does not create a file when there is nothing to say", () => {
    const file = path.join(tmp(), "Gym-bro.md");
    expect(appendBlocks(file, [])).toBe(0);
    expect(fs.existsSync(file)).toBe(false);
  });
});
