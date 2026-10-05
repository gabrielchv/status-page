import "server-only";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { checks, incidents, monitors } from "@/db/schema";
import { computeUptime } from "@/lib/uptime";

export async function getStatusBySlug(slug: string) {
  const m = await db
    .select()
    .from(monitors)
    .where(eq(monitors.slug, slug))
    .limit(1);

  const monitor = m[0];
  if (!monitor) return null;

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      success: checks.success,
      latencyMs: checks.latencyMs,
      checkedAt: checks.checkedAt,
      statusCode: checks.statusCode,
      error: checks.error,
    })
    .from(checks)
    .where(and(eq(checks.monitorId, monitor.id), gte(checks.checkedAt, since)))
    .orderBy(desc(checks.checkedAt));

  const uptime = computeUptime(rows);

  const openIncident = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.monitorId, monitor.id), isNull(incidents.resolvedAt)))
    .limit(1);

  const recentIncidents = await db
    .select()
    .from(incidents)
    .where(eq(incidents.monitorId, monitor.id))
    .orderBy(desc(incidents.startedAt))
    .limit(20);

  const lastCheck = rows[0] ?? null;
  const status = lastCheck === null ? "unknown" : lastCheck.success ? "up" : "down";

  return {
    name: monitor.name,
    url: monitor.url,
    slug: monitor.slug,
    status,
    lastCheck: lastCheck
      ? {
          statusCode: lastCheck.statusCode,
          latencyMs: lastCheck.latencyMs,
          success: lastCheck.success,
          error: lastCheck.error,
          checkedAt: lastCheck.checkedAt,
        }
      : null,
    uptime,
    openIncident: openIncident[0] ?? null,
    recentIncidents,
  };
}
