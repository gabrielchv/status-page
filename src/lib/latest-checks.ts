import "server-only";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { checks } from "@/db/schema";

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
 *
 * The id list is bound with Drizzle's `inArray`, not by interpolating a JS array
 * into the `sql` template. A template placeholder binds one *scalar* parameter,
 * so `any(${ids}::uuid[])` sent the array as a single text value and Postgres
 * answered `malformed array literal: "a5c8…"` — a 500 on every page that used
 * it. Verified against a real Postgres through the actual driver, which is what
 * the earlier psql-only check could not catch.
 */
export async function latestCheckByMonitor(
  monitorIds: string[],
): Promise<Map<string, LatestCheck>> {
  if (monitorIds.length === 0) return new Map();

  // `distinct on` needs its ORDER BY to start with the DISTINCT ON expression,
  // which the select-builder cannot express, so the single-row-per-group part
  // stays raw SQL while the id list is bound as parameters.
  const rows = await db
    .select({
      monitorId: checks.monitorId,
      statusCode: checks.statusCode,
      latencyMs: checks.latencyMs,
      success: checks.success,
      error: checks.error,
      checkedAt: checks.checkedAt,
      rowNumber:
        sql<number>`row_number() over (partition by ${checks.monitorId} order by ${checks.checkedAt} desc)`.as(
          "row_number",
        ),
    })
    .from(checks)
    .where(inArray(checks.monitorId, monitorIds))
    .as("ranked");

  const latest = await db
    .select({
      monitorId: rows.monitorId,
      statusCode: rows.statusCode,
      latencyMs: rows.latencyMs,
      success: rows.success,
      error: rows.error,
      checkedAt: rows.checkedAt,
    })
    .from(rows)
    .where(sql`${rows.rowNumber} = 1`);

  const byMonitor = new Map<string, LatestCheck>();
  for (const row of latest) {
    byMonitor.set(row.monitorId, row);
  }
  return byMonitor;
}
