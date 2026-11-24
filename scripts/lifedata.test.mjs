import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendBlocks,
  blockFor,
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
  exercises: [],
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
    expect(sessionFields(session())).toEqual([
      "workout: Pequeño Putarraco",
      "day: Day 2",
      "at: 20:58",
      "duration: 57min",
      "done: 88%",
      "sets: 23/26",
    ]);
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

describe("the detail lines", () => {
  const ex = (name, sets, logged) => ({ name, sets, logged });

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

describe("a day's block", () => {
  it("is one summary line plus its details", () => {
    const block = blockFor(
      "2026-11-12",
      [session({ exercises: [{ name: "Dominadas neutras", sets: 3, logged: 0 }] })],
    );
    expect(block).toBe(
      "2026-11-12 · workout: Pequeño Putarraco · day: Day 2 · at: 20:58 · duration: 57min · done: 88% · sets: 23/26\n" +
        "  - skipped exercise: Dominadas neutras (3 sets)",
    );
  });

  it("is a bare summary line when nothing was missed", () => {
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
    });
    const evening = session({
      day: "Day 3",
      startedAt: at("2026-11-12T23:00:00Z"), // 20:00
      endedAt: at("2026-11-12T23:40:00Z"),
      logged: 6,
      planned: 8,
      exercises: [{ name: "Face pulls", sets: 2, logged: 0 }],
    });
    const lines = blockFor("2026-11-12", [morning, evening]).split("\n");
    expect(lines[0]).toBe(
      "2026-11-12 · sessions: 2 · workout: Pequeño Putarraco · day: Day 1, Day 3 · at: 08:00 · duration: 70min · done: 89% · sets: 16/18",
    );
    expect(lines[1]).toBe(
      "  - session 1 · workout: Pequeño Putarraco · day: Day 1 · at: 08:00 · duration: 30min · done: 100% · sets: 10/10",
    );
    expect(lines[2]).toBe(
      "  - session 2 · workout: Pequeño Putarraco · day: Day 3 · at: 20:00 · duration: 40min · done: 75% · sets: 6/8",
    );
    expect(lines[3]).toBe("  - skipped exercise: Face pulls (2 sets)");
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
