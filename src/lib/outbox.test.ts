import { describe, expect, it } from "vitest";
import {
  applyResult,
  enqueue,
  parseQueue,
  serializeQueue,
  waiting,
  type OutboxEntry,
  type OutboxOp,
} from "./outbox";

const S = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const EX = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EX2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const log = (setNumber: number, reps: number, exerciseId = EX): OutboxOp => ({
  kind: "log",
  sessionId: S,
  exerciseId,
  setNumber,
  weight: 40,
  reps,
  timeSeconds: null,
  hitTarget: false,
});

const skip = (setNumber: number, exerciseId = EX): OutboxOp => ({
  kind: "skip",
  sessionId: S,
  sets: [{ exerciseId, setNumber }],
});

/** enqueue a list of ops onto an empty queue, with predictable ids. */
const build = (ops: OutboxOp[]) => {
  let q: OutboxEntry[] = [];
  ops.forEach((op, i) => {
    q = enqueue(q, op, { id: `e${i}`, now: 1000 + i });
  });
  return q;
};

const kinds = (q: OutboxEntry[]) => q.map((e) => e.op.kind);

describe("enqueue", () => {
  it("keeps writes in the order they happened", () => {
    const q = build([log(1, 10), skip(2), log(3, 8)]);
    expect(kinds(q)).toEqual(["log", "skip", "log"]);
    expect(q.map((e) => e.id)).toEqual(["e0", "e1", "e2"]);
  });

  it("starts each entry with no attempts and the time it was queued", () => {
    const q = build([log(1, 10)]);
    expect(q[0].attempts).toBe(0);
    expect(q[0].queuedAt).toBe(1000);
  });

  it("replaces a pending log for the same set rather than piling up", () => {
    // Tapping "update set" three times offline is still one row in the end.
    const q = build([log(1, 10), log(1, 11), log(1, 12)]);
    expect(q).toHaveLength(1);
    expect((q[0].op as Extract<OutboxOp, { kind: "log" }>).reps).toBe(12);
  });

  it("treats the same set number under a different exercise as its own set", () => {
    const q = build([log(1, 10, EX), log(1, 10, EX2)]);
    expect(q).toHaveLength(2);
  });

  it("keeps a skip between two logs of the same set", () => {
    // The real gym sequence: logged it, changed my mind, then logged it again.
    // The skip must stay in the stream, because dropping ops is how a replay
    // stops matching what actually happened.
    const q = build([log(1, 10), skip(1), log(1, 12)]);
    expect(kinds(q)).toEqual(["skip", "log"]);
    expect((q[1].op as Extract<OutboxOp, { kind: "log" }>).reps).toBe(12);
  });

  it("replaces a pending note for the same exercise", () => {
    const q = build([
      { kind: "note", sessionId: S, exerciseId: EX, note: "felt weak" },
      { kind: "note", sessionId: S, exerciseId: EX, note: "machine taken" },
    ]);
    expect(q).toHaveLength(1);
    expect((q[0].op as Extract<OutboxOp, { kind: "note" }>).note).toBe("machine taken");
  });

  it("keeps notes for different exercises apart", () => {
    const q = build([
      { kind: "note", sessionId: S, exerciseId: EX, note: "a" },
      { kind: "note", sessionId: S, exerciseId: EX2, note: "b" },
    ]);
    expect(q).toHaveLength(2);
  });

  it("drops pending skips when all skips are undone", () => {
    // "undo" would otherwise replay as: create the skips, then delete them.
    const q = build([skip(1), skip(2), { kind: "unskip", sessionId: S }]);
    expect(kinds(q)).toEqual(["unskip"]);
  });

  it("keeps the undo itself, because earlier skips may already be in the db", () => {
    const q = build([{ kind: "unskip", sessionId: S }]);
    expect(kinds(q)).toEqual(["unskip"]);
  });

  it("leaves logged sets alone when skips are undone", () => {
    const q = build([log(1, 10), skip(2), { kind: "unskip", sessionId: S }]);
    expect(kinds(q)).toEqual(["log", "unskip"]);
  });

  it("does not touch another session's skips", () => {
    const q = build([
      skip(1),
      { kind: "skip", sessionId: S2, sets: [{ exerciseId: EX, setNumber: 1 }] },
      { kind: "unskip", sessionId: S },
    ]);
    expect(kinds(q)).toEqual(["skip", "unskip"]);
    expect((q[0].op as Extract<OutboxOp, { kind: "skip" }>).sessionId).toBe(S2);
  });

  it("only drops skips for the one exercise when that exercise is unskipped", () => {
    const q = build([
      skip(1, EX),
      skip(1, EX2),
      { kind: "unskip", sessionId: S, exerciseId: EX },
    ]);
    expect(kinds(q)).toEqual(["skip", "unskip"]);
    expect((q[0].op as Extract<OutboxOp, { kind: "skip" }>).sets[0].exerciseId).toBe(EX2);
  });

  it("replaces a pending finish for the same session", () => {
    const q = build([
      { kind: "finish", sessionId: S, finishedAtMs: 100 },
      { kind: "finish", sessionId: S, finishedAtMs: 200 },
    ]);
    expect(q).toHaveLength(1);
    expect((q[0].op as Extract<OutboxOp, { kind: "finish" }>).finishedAtMs).toBe(200);
  });
});

describe("applyResult", () => {
  const base = () => build([log(1, 10), log(2, 10), log(3, 10)]);

  it("removes what the server accepted", () => {
    const { queue } = applyResult(base(), { applied: ["e0", "e1"], failed: [] });
    expect(queue.map((e) => e.id)).toEqual(["e2"]);
  });

  it("drops an entry the server rejected for good, and reports it", () => {
    const { queue, dropped } = applyResult(base(), {
      applied: ["e0"],
      failed: [{ id: "e1", permanent: true, message: "Session not found" }],
    });
    expect(queue.map((e) => e.id)).toEqual(["e2"]);
    expect(dropped).toEqual([{ id: "e1", permanent: true, message: "Session not found" }]);
  });

  it("keeps an entry that failed for now, and counts the attempt", () => {
    // Never dropped on a count: a set lost because the server had a bad minute
    // is exactly the failure this whole feature exists to prevent.
    const { queue, dropped } = applyResult(base(), {
      applied: [],
      failed: [{ id: "e0", permanent: false, message: "boom" }],
    });
    expect(queue.map((e) => e.id)).toEqual(["e0", "e1", "e2"]);
    expect(queue[0].attempts).toBe(1);
    expect(dropped).toEqual([]);
  });

  it("leaves untouched entries' attempt counts alone", () => {
    const { queue } = applyResult(base(), {
      applied: [],
      failed: [{ id: "e0", permanent: false, message: "boom" }],
    });
    expect(queue[1].attempts).toBe(0);
  });

  it("ignores ids it does not know about", () => {
    const { queue } = applyResult(base(), { applied: ["nope"], failed: [] });
    expect(queue).toHaveLength(3);
  });
});

describe("parseQueue", () => {
  it("round-trips a queue through storage", () => {
    const q = build([log(1, 10), skip(2), { kind: "finish", sessionId: S, finishedAtMs: 5 }]);
    expect(parseQueue(serializeQueue(q))).toEqual(q);
  });

  it("is empty when there is nothing stored", () => {
    expect(parseQueue(null)).toEqual([]);
  });

  it("survives garbage rather than taking the app down with it", () => {
    expect(parseQueue("not json")).toEqual([]);
    expect(parseQueue("{}")).toEqual([]);
    expect(parseQueue("[1,2,3]")).toEqual([]);
  });

  it("throws away entries it cannot make sense of but keeps the rest", () => {
    const good = build([log(1, 10)]);
    const raw = JSON.stringify([...good, { id: "x" }, { id: "y", op: { kind: "nonsense" } }]);
    expect(parseQueue(raw)).toEqual(good);
  });
});

describe("waiting", () => {
  it("counts nothing for an empty queue", () => {
    expect(waiting([])).toEqual({ sets: 0, other: 0 });
  });

  it("counts a logged set and each skipped set", () => {
    const q = build([log(1, 10), { kind: "skip", sessionId: S, sets: [
      { exerciseId: EX, setNumber: 2 },
      { exerciseId: EX, setNumber: 3 },
    ] }]);
    expect(waiting(q)).toEqual({ sets: 3, other: 0 });
  });

  it("counts notes, undos and finishes separately from sets", () => {
    const q = build([
      { kind: "note", sessionId: S, exerciseId: EX, note: "x" },
      { kind: "unskip", sessionId: S },
      { kind: "finish", sessionId: S, finishedAtMs: 1 },
    ]);
    expect(waiting(q)).toEqual({ sets: 0, other: 3 });
  });
});
