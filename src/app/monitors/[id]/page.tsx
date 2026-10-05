import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { checks, monitors } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getStatusBySlug } from "@/lib/status";
import { formatDate, formatDuration } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { MonitorForm } from "@/components/monitor-form";
import { MonitorControls } from "@/components/monitor-controls";

export const dynamic = "force-dynamic";

export default async function MonitorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;

  const rows = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.userId, user.id)))
    .limit(1);

  const monitor = rows[0];
  if (!monitor) notFound();

  const status = await getStatusBySlug(monitor.slug);

  const recentChecks = await db
    .select()
    .from(checks)
    .where(eq(checks.monitorId, monitor.id))
    .orderBy(desc(checks.checkedAt))
    .limit(50);

  const uptime = status?.uptime;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-zinc-900">{monitor.name}</h1>
            {status && <StatusBadge status={status.status as "up" | "down" | "unknown"} />}
          </div>
          <p className="mt-1 text-sm text-zinc-500">{monitor.url}</p>
          <Link
            href={`/status/${monitor.slug}`}
            className="mt-1 inline-block text-sm text-zinc-600 underline"
          >
            Public status page → /status/{monitor.slug}
          </Link>
        </div>
        <MonitorControls id={monitor.id} active={monitor.active} />
      </div>

      {uptime && (
        <div className="mb-6 grid grid-cols-4 gap-4">
          {(
            [
              ["7 days", uptime.uptime7d],
              ["30 days", uptime.uptime30d],
              ["90 days", uptime.uptime90d],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">
                {value === null ? "—" : `${value}%`}
              </p>
            </div>
          ))}
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Avg latency</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">
              {uptime.avgLatencyMs === null ? "—" : `${uptime.avgLatencyMs} ms`}
            </p>
          </div>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Recent checks</h2>
          {recentChecks.length === 0 ? (
            <p className="text-sm text-zinc-500">No checks recorded yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm">
              {recentChecks.slice(0, 12).map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span className="text-zinc-500">{formatDate(c.checkedAt)}</span>
                  <span className="flex items-center gap-3">
                    <span
                      className={
                        c.success ? "text-emerald-600" : "text-red-600"
                      }
                    >
                      {c.success ? "up" : "down"}
                    </span>
                    <span className="text-zinc-400">
                      {c.statusCode ?? c.error ?? "—"}
                    </span>
                    <span className="text-zinc-400">{c.latencyMs} ms</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Incidents</h2>
          {status && status.recentIncidents.length === 0 ? (
            <p className="text-sm text-zinc-500">No incidents recorded.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm">
              {status?.recentIncidents.slice(0, 12).map((inc) => {
                const end = inc.resolvedAt ? new Date(inc.resolvedAt) : new Date();
                const duration = end.getTime() - new Date(inc.startedAt).getTime();
                return (
                  <li key={inc.id} className="py-2">
                    <div className="flex items-center justify-between">
                      <span className={inc.resolvedAt ? "text-zinc-600" : "font-medium text-red-600"}>
                        {inc.resolvedAt ? "Resolved" : "Ongoing"}
                      </span>
                      <span className="text-zinc-400">{formatDuration(duration)}</span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {formatDate(inc.startedAt)}
                      {inc.cause ? ` — ${inc.cause}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Edit monitor</h2>
        <MonitorForm
          monitor={{
            id: monitor.id,
            name: monitor.name,
            url: monitor.url,
            expectedStatus: monitor.expectedStatus,
            timeoutMs: monitor.timeoutMs,
            intervalSec: monitor.intervalSec,
          }}
        />
      </section>
    </main>
  );
}
