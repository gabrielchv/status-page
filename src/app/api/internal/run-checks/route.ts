import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { monitors } from "@/db/schema";
import { runCheck } from "@/lib/check/runner";
import { recordCheck } from "@/lib/check/record";
import { env } from "@/env";
import { inc } from "@/lib/metrics";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

let running = false;

export async function POST(request: Request) {
  const secret = request.headers.get("x-runner-secret") ?? "";
  if (!safeEqual(secret, env.CHECK_RUNNER_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (running) {
    return Response.json({ skipped: true, reason: "already running" });
  }

  running = true;
  try {
    const all = await db.select().from(monitors).where(eq(monitors.active, true));

    const now = Date.now();
    const due = all.filter((m) => {
      if (!m.lastCheckedAt) return true;
      return now - m.lastCheckedAt.getTime() >= m.intervalSec * 1000;
    });

    let checked = 0;
    let failures = 0;

    for (const monitor of due) {
      const result = await runCheck(monitor.url, {
        timeoutMs: monitor.timeoutMs,
        expectedStatus: monitor.expectedStatus,
      });
      await recordCheck(monitor, result);
      checked += 1;
      if (!result.success) failures += 1;
    }

    inc("status_runs_total");
    logger.info({ checked, failures, due: due.length }, "run-checks completed");

    return Response.json({ checked, failures, due: due.length });
  } finally {
    running = false;
  }
}
