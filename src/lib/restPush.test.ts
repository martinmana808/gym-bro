import { describe, expect, it } from "vitest";
import { MAX_REST_PUSH_SECONDS, clampRestSeconds, restNotification } from "./restPush";

describe("clampRestSeconds", () => {
  it("keeps a normal rest as-is", () => {
    expect(clampRestSeconds(90)).toBe(90);
  });

  it("rounds fractional seconds", () => {
    expect(clampRestSeconds(90.6)).toBe(91);
  });

  it("floors at 1 so a scheduled alert is never in the past", () => {
    expect(clampRestSeconds(0)).toBe(1);
    expect(clampRestSeconds(-30)).toBe(1);
  });

  it("caps at the function's max duration", () => {
    expect(clampRestSeconds(99_999)).toBe(MAX_REST_PUSH_SECONDS);
  });

  it("falls back to 1 for junk", () => {
    expect(clampRestSeconds(Number.NaN)).toBe(1);
    expect(clampRestSeconds(Number.POSITIVE_INFINITY)).toBe(MAX_REST_PUSH_SECONDS);
  });
});

describe("restNotification", () => {
  it("names the next exercise", () => {
    expect(restNotification("Press plano")).toEqual({
      title: "Rest over 💪",
      body: "Next up: Press plano",
      tag: "rest",
      url: "/",
    });
  });

  it("still works when the next exercise is unknown", () => {
    expect(restNotification(null).body).toBe("Back to it.");
  });

  it("links straight back to the running session when given one", () => {
    expect(restNotification("Peck deck", "abc").url).toBe("/sessions/abc");
  });

  it("trims runaway exercise names", () => {
    const long = "x".repeat(200);
    expect(restNotification(long).body.length).toBeLessThanOrEqual(90);
  });
});
