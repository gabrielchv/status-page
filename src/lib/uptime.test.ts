import { describe, expect, it } from "vitest";
import { EMPTY_COUNTS, summaryFromCounts, type UptimeCounts } from "./uptime";

function counts(overrides: Partial<UptimeCounts>): UptimeCounts {
  return { ...EMPTY_COUNTS, ...overrides };
}

describe("summaryFromCounts", () => {
  it("returns null uptime and zero checks for an empty dataset", () => {
    const summary = summaryFromCounts(EMPTY_COUNTS);
    expect(summary.totalChecks).toBe(0);
    expect(summary.uptime7d).toBeNull();
    expect(summary.uptime30d).toBeNull();
    expect(summary.uptime90d).toBeNull();
    expect(summary.avgLatencyMs).toBeNull();
  });

  it("computes 100% when all checks succeed", () => {
    const summary = summaryFromCounts(counts({ ok7: 2, total7: 2 }));
    expect(summary.uptime7d).toBe(100);
  });

  it("computes 50% when half the checks fail", () => {
    const summary = summaryFromCounts(counts({ ok7: 1, total7: 2 }));
    expect(summary.uptime7d).toBe(50);
  });

  it("keeps each window independent", () => {
    // The DB decides window membership; this layer must not re-derive it.
    const summary = summaryFromCounts(
      counts({ ok7: 1, total7: 1, ok30: 1, total30: 2, ok90: 1, total90: 2 }),
    );
    expect(summary.uptime7d).toBe(100);
    expect(summary.uptime30d).toBe(50);
    expect(summary.uptime90d).toBe(50);
  });

  it("rounds to two decimal places", () => {
    const summary = summaryFromCounts(counts({ ok7: 1, total7: 3 }));
    expect(summary.uptime7d).toBe(33.33);
  });

  it("computes average latency", () => {
    const summary = summaryFromCounts(
      counts({ latencySum: 400, latencyCount: 2 }),
    );
    expect(summary.avgLatencyMs).toBe(200);
  });
});
