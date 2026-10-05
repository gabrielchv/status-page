import { describe, expect, it } from "vitest";
import { nextTransition } from "./transition";

describe("nextTransition", () => {
  it("no-op on the first healthy check", () => {
    expect(nextTransition(null, true)).toBe("none");
  });

  it("opens an incident on the first failing check", () => {
    expect(nextTransition(null, false)).toBe("down");
  });

  it("no-op while staying up", () => {
    expect(nextTransition(true, true)).toBe("none");
  });

  it("opens an incident when going down", () => {
    expect(nextTransition(true, false)).toBe("down");
  });

  it("no-op while staying down", () => {
    expect(nextTransition(false, false)).toBe("none");
  });

  it("recovers when coming back up", () => {
    expect(nextTransition(false, true)).toBe("recovered");
  });
});
