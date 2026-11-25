import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type LatestCheck = {
  monitorId: string;
  statusCode: number | null;
  latencyMs: number;
  success: boolean;
  error: string | null;
  checkedAt: Date;
};

/**
 * The most recent check for each monitor, one row per monitor.
 *
 * Both the dashboard and the monitor list previously did
 * `select().from(checks).where(inArray(monitorId, ids)).orderBy(desc(checkedAt))`
 * with no limit, then kept the first row per monitor in JS. That loads the
 * entire check history of every monitor the user owns and discards all but one
 * row each — a full scan whose cost grows with how long the account has been
 * monitoring, on every page load.
 *
 * `distinct on (monitor_id) ... order by monitor_id, checked_at desc` is
 * Postgres' idiom for "first row per group", and the existing
 * `checks_monitor_checked_idx` on `(monitor_id, checked_at)` serves it directly.
 */
export async function latestCheckByMonitor(
  monitorIds: string[],
): Promise<Map<string, LatestCheck>> {
  if (monitorIds.length === 0) return new Map();

  const rows = await db.execute<LatestCheck>(sql`
    select distinct on (monitor_id)
      monitor_id   as "monitorId",
      status_code  as "statusCode",
      latency_ms   as "latencyMs",
      success,
      error,
      checked_at   as "checkedAt"
    from checks
    where monitor_id = any(${monitorIds}::uuid[])
    order by monitor_id, checked_at desc
  `);

  const byMonitor = new Map<string, LatestCheck>();
  for (const row of rows) {
    byMonitor.set(row.monitorId, row);
  }
  return byMonitor;
}
