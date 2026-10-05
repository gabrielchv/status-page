import { describe, expect, it } from "vitest";
import { computeUptime, type UptimeRow } from "./uptime";

function row(success: boolean, ageMinutes: number): UptimeRow {
  return {
    success,
    latencyMs: 100,
    checkedAt: new Date(Date.now() - ageMinutes * 60_000),
  };
}

describe("computeUptime", () => {
  it("returns null uptime and zero checks for an empty dataset", () => {
    const summary = computeUptime([]);
    expect(summary.totalChecks).toBe(0);
    expect(summary.uptime7d).toBeNull();
    expect(summary.avgLatencyMs).toBeNull();
  });

  it("computes 100% when all checks succeed", () => {
    const summary = computeUptime([row(true, 10), row(true, 20)]);
    expect(summary.uptime7d).toBe(100);
  });

  it("computes 50% when half the checks fail", () => {
    const summary = computeUptime([row(true, 10), row(false, 20)]);
    expect(summary.uptime7d).toBe(50);
  });

  it("excludes checks older than the window", () => {
    const summary = computeUptime([
      row(true, 10), // within 7d
      row(false, 10 * 24 * 60), // 10 days ago: within 30d/90d, outside 7d
      row(false, 100 * 24 * 60), // 100 days ago: outside 90d
    ]);
    expect(summary.uptime7d).toBe(100);
    expect(summary.uptime30d).toBe(50);
    expect(summary.uptime90d).toBe(50);
  });

  it("computes average latency", () => {
    const a: UptimeRow = {
      success: true,
      latencyMs: 100,
      checkedAt: new Date(Date.now() - 1000),
    };
    const b: UptimeRow = {
      success: true,
      latencyMs: 300,
      checkedAt: new Date(Date.now() - 2000),
    };
    expect(computeUptime([a, b]).avgLatencyMs).toBe(200);
  });
});
