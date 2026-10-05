import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { checks, incidents, monitors } from "@/db/schema";
import { nextTransition } from "./transition";
import { publish } from "@/lib/sse";
import { inc } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import type { CheckResult } from "./runner";

/**
 * Persist a check result and drive incident open/close transitions, then
 * publish the new status to any connected status-page subscribers.
 */
export async function recordCheck(
  monitor: { id: string; slug: string; url: string },
  result: CheckResult,
): Promise<void> {
  const prev = await db
    .select({ success: checks.success })
    .from(checks)
    .where(eq(checks.monitorId, monitor.id))
    .orderBy(desc(checks.checkedAt))
    .limit(1);

  const prevSuccess = prev[0]?.success ?? null;
  const transition = nextTransition(prevSuccess, result.success);

  await db.insert(checks).values({
    monitorId: monitor.id,
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    success: result.success,
    error: result.error,
  });

  await db
    .update(monitors)
    .set({ lastCheckedAt: new Date() })
    .where(eq(monitors.id, monitor.id));

  if (transition === "down") {
    await db.insert(incidents).values({
      monitorId: monitor.id,
      cause: result.error ?? `HTTP ${result.statusCode}`,
    });
    inc("status_incidents_total", 1, { transition: "down" });
  } else if (transition === "recovered") {
    await db
      .update(incidents)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(incidents.monitorId, monitor.id),
          isNull(incidents.resolvedAt),
        ),
      );
    inc("status_incidents_total", 1, { transition: "recovered" });
  }

  inc("status_checks_total", 1, {
    monitor_id: monitor.id,
    result: result.success ? "success" : "failure",
  });
  inc("status_check_latency_ms_sum", result.latencyMs);
  inc("status_check_latency_ms_count", 1);

  logger.info(
    {
      monitorId: monitor.id,
      slug: monitor.slug,
      url: monitor.url,
      success: result.success,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      transition,
    },
    "check recorded",
  );

  publish(monitor.slug, {
    type: "check",
    monitorId: monitor.id,
    success: result.success,
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    checkedAt: new Date().toISOString(),
    transition,
  });
}
