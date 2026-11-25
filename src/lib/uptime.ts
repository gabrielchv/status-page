export type UptimeSummary = {
  uptime7d: number | null;
  uptime30d: number | null;
  uptime90d: number | null;
  avgLatencyMs: number | null;
  totalChecks: number;
};

/**
 * Per-window tallies for one monitor, produced by the database rather than by
 * loading rows into memory.
 *
 * This used to be `computeUptime(rows)` over every check in the last 90 days.
 * At the minimum interval of 30s that is ~259,200 rows per monitor, materialized
 * into JS objects on every unauthenticated `GET /api/status/<slug>` — and the
 * status page refreshes on every SSE `check` event, so one open tab re-ran it
 * every 30s. Aggregating in SQL makes the cost a constant: one row out, however
 * long the monitor has been running.
 */
export type UptimeCounts = {
  ok7: number;
  total7: number;
  ok30: number;
  total30: number;
  ok90: number;
  total90: number;
  latencySum: number;
  latencyCount: number;
};

export const EMPTY_COUNTS: UptimeCounts = {
  ok7: 0,
  total7: 0,
  ok30: 0,
  total30: 0,
  ok90: 0,
  total90: 0,
  latencySum: 0,
  latencyCount: 0,
};

function percent(ok: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((ok / total) * 10000) / 100;
}

/** Pure aggregation over pre-tallied counts. */
export function summaryFromCounts(counts: UptimeCounts): UptimeSummary {
  return {
    uptime7d: percent(counts.ok7, counts.total7),
    uptime30d: percent(counts.ok30, counts.total30),
    uptime90d: percent(counts.ok90, counts.total90),
    avgLatencyMs:
      counts.latencyCount > 0
        ? Math.round(counts.latencySum / counts.latencyCount)
        : null,
    totalChecks: counts.total90,
  };
}
