export type UptimeRow = {
  success: boolean;
  latencyMs: number;
  checkedAt: Date;
};

export type UptimeSummary = {
  uptime7d: number | null;
  uptime30d: number | null;
  uptime90d: number | null;
  avgLatencyMs: number | null;
  totalChecks: number;
};

const DAYS = [7, 30, 90] as const;

function percent(ok: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((ok / total) * 10000) / 100;
}

/**
 * Pure aggregation over check rows. Each window computes the percentage of
 * successful checks and the mean latency over that window.
 */
export function computeUptime(rows: UptimeRow[]): UptimeSummary {
  const now = Date.now();
  const windows = new Map<(typeof DAYS)[number], { ok: number; total: number; latency: number }>();

  for (const d of DAYS) {
    windows.set(d, { ok: 0, total: 0, latency: 0 });
  }

  let totalChecks = 0;
  let latencySum = 0;
  let latencyCount = 0;

  for (const row of rows) {
    const age = now - row.checkedAt.getTime();
    totalChecks += 1;
    latencySum += row.latencyMs;
    latencyCount += 1;

    for (const d of DAYS) {
      if (age <= d * 24 * 60 * 60 * 1000) {
        const w = windows.get(d)!;
        w.total += 1;
        if (row.success) w.ok += 1;
        w.latency += row.latencyMs;
      }
    }
  }

  const summary: UptimeSummary = {
    uptime7d: null,
    uptime30d: null,
    uptime90d: null,
    avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
    totalChecks,
  };

  summary.uptime7d = (() => {
    const w = windows.get(7)!;
    return w.total > 0 ? percent(w.ok, w.total) : null;
  })();
  summary.uptime30d = (() => {
    const w = windows.get(30)!;
    return w.total > 0 ? percent(w.ok, w.total) : null;
  })();
  summary.uptime90d = (() => {
    const w = windows.get(90)!;
    return w.total > 0 ? percent(w.ok, w.total) : null;
  })();

  return summary;
}
