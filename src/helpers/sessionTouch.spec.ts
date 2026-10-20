import { describe, expect, it } from "vitest";
import { shouldTouchSession } from "./sessionTouch";

describe("shouldTouchSession", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");

  it("touches sessions without a last access time", () => {
    expect(shouldTouchSession({ lastAccessed: null, now })).toBe(true);
  });

  it("does not touch a session accessed four minutes ago", () => {
    expect(shouldTouchSession({ lastAccessed: new Date(now.getTime() - 4 * 60_000), now })).toBe(false);
  });

  it("touches a session accessed six minutes ago", () => {
    expect(shouldTouchSession({ lastAccessed: new Date(now.getTime() - 6 * 60_000), now })).toBe(true);
  });
});
