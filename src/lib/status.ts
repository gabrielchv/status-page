import "server-only";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { checks, incidents, monitors } from "@/db/schema";
import { EMPTY_COUNTS, summaryFromCounts, type UptimeCounts } from "@/lib/uptime";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

/**
 * One row of tallies instead of every check in the window.
 *
 * Postgres computes the counts with conditional aggregates, so the query plan
 * stays an index scan and the payload is constant. See the note on
 * `UptimeCounts` for what this replaced and why it mattered.
 */
async function uptimeCounts(monitorId: string): Promise<UptimeCounts> {
  // ISO strings, not Date objects. `drizzle-orm/postgres-js` passes raw `sql`
  // parameters to postgres.js, which does not serialise Date instances and
  // throws `The "string" argument must be of type string ... Received an
  // instance of Date`. Inside a template the bound value is raw, unlike a
  // column comparison where Drizzle applies the column's codec.
  const since7 = daysAgo(7).toISOString();
  const since30 = daysAgo(30).toISOString();

  const rows = await db
    .select({
      ok7: sql<number>`count(*) filter (where ${checks.checkedAt} >= ${since7}::timestamptz and ${checks.success})`,
      total7: sql<number>`count(*) filter (where ${checks.checkedAt} >= ${since7}::timestamptz)`,
      ok30: sql<number>`count(*) filter (where ${checks.checkedAt} >= ${since30}::timestamptz and ${checks.success})`,
      total30: sql<number>`count(*) filter (where ${checks.checkedAt} >= ${since30}::timestamptz)`,
      ok90: sql<number>`count(*) filter (where ${checks.success})`,
      total90: sql<number>`count(*)`,
      latencySum: sql<number>`coalesce(sum(${checks.latencyMs}), 0)`,
      latencyCount: sql<number>`count(${checks.latencyMs})`,
    })
    .from(checks)
    .where(and(eq(checks.monitorId, monitorId), gte(checks.checkedAt, daysAgo(90))));

  const row = rows[0];
  if (!row) return EMPTY_COUNTS;

  // postgres returns bigint counts as strings through this driver.
  const num = (value: unknown): number => Number(value ?? 0);

  return {
    ok7: num(row.ok7),
    total7: num(row.total7),
    ok30: num(row.ok30),
    total30: num(row.total30),
    ok90: num(row.ok90),
    total90: num(row.total90),
    latencySum: num(row.latencySum),
    latencyCount: num(row.latencyCount),
  };
}

export async function getStatusBySlug(slug: string) {
  const m = await db
    .select()
    .from(monitors)
    .where(eq(monitors.slug, slug))
    .limit(1);

  const monitor = m[0];
  if (!monitor) return null;

  const [counts, lastRows, openIncident, recentIncidents] = await Promise.all([
    uptimeCounts(monitor.id),
    db
      .select({
        statusCode: checks.statusCode,
        latencyMs: checks.latencyMs,
        success: checks.success,
        error: checks.error,
        checkedAt: checks.checkedAt,
      })
      .from(checks)
      .where(eq(checks.monitorId, monitor.id))
      .orderBy(desc(checks.checkedAt))
      .limit(1),
    db
      .select()
      .from(incidents)
      .where(and(eq(incidents.monitorId, monitor.id), isNull(incidents.resolvedAt)))
      .limit(1),
    db
      .select()
      .from(incidents)
      .where(eq(incidents.monitorId, monitor.id))
      .orderBy(desc(incidents.startedAt))
      .limit(20),
  ]);

  const uptime = summaryFromCounts(counts);
  const lastCheck = lastRows[0] ?? null;
  const status = lastCheck === null ? "unknown" : lastCheck.success ? "up" : "down";

  return {
    name: monitor.name,
    url: monitor.url,
    slug: monitor.slug,
    status,
    lastCheck,
    uptime,
    openIncident: openIncident[0] ?? null,
    recentIncidents,
  };
}
