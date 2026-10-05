import { notFound } from "next/navigation";
import { getStatusBySlug } from "@/lib/status";
import { formatDate, formatDuration } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { StatusRefresher } from "@/components/status-refresher";

export const dynamic = "force-dynamic";

export default async function StatusPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const status = await getStatusBySlug(slug);
  if (!status) notFound();

  const uptime = status.uptime;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <StatusRefresher slug={slug} />

      <div className="rounded-lg border border-zinc-200 bg-white p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{status.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">{status.url}</p>
          </div>
          <StatusBadge status={status.status as "up" | "down" | "unknown"} />
        </div>

        {status.openIncident && (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-700">Service disruption</p>
            <p className="mt-1 text-sm text-red-600">
              {status.openIncident.cause ?? "No cause recorded"} — since{" "}
              {formatDate(status.openIncident.startedAt)}
            </p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-3 gap-4">
          {(
            [
              ["7 days", uptime.uptime7d],
              ["30 days", uptime.uptime30d],
              ["90 days", uptime.uptime90d],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-md bg-zinc-50 p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">
                {value === null ? "—" : `${value}%`}
              </p>
            </div>
          ))}
        </div>

        {status.lastCheck && (
          <p className="mt-6 text-sm text-zinc-500">
            Last checked {formatDate(status.lastCheck.checkedAt)}
            {status.lastCheck.statusCode
              ? ` — HTTP ${status.lastCheck.statusCode} in ${status.lastCheck.latencyMs} ms`
              : ` — ${status.lastCheck.latencyMs} ms`}
          </p>
        )}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Incident history</h2>
        {status.recentIncidents.length === 0 ? (
          <p className="text-sm text-zinc-500">No incidents on record.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {status.recentIncidents.map((inc) => {
              const end = inc.resolvedAt ? new Date(inc.resolvedAt) : new Date();
              const duration = end.getTime() - new Date(inc.startedAt).getTime();
              return (
                <li key={inc.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="text-zinc-600">
                      {formatDate(inc.startedAt)}
                      {inc.cause ? ` — ${inc.cause}` : ""}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {inc.resolvedAt ? `Resolved ${formatDate(inc.resolvedAt)}` : "Ongoing"}
                    </p>
                  </div>
                  <span className="text-zinc-400">{formatDuration(duration)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
