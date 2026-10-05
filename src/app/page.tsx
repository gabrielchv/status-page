import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { checks, monitors } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userMonitors = await db
    .select()
    .from(monitors)
    .where(eq(monitors.userId, user.id));

  const ids = userMonitors.map((m) => m.id);
  const latest = ids.length
    ? await db
        .select()
        .from(checks)
        .where(inArray(checks.monitorId, ids))
        .orderBy(desc(checks.checkedAt))
    : [];

  const latestByMonitor = new Map<string, (typeof latest)[number]>();
  for (const c of latest) {
    if (!latestByMonitor.has(c.monitorId)) latestByMonitor.set(c.monitorId, c);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Monitors</h1>
          <p className="text-sm text-zinc-500">
            Hello, {user.name || user.email}. {userMonitors.length} monitor
            {userMonitors.length === 1 ? "" : "s"}.
          </p>
        </div>
        <Link
          href="/monitors"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Manage monitors
        </Link>
      </div>

      {userMonitors.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center">
          <p className="text-zinc-600">No monitors yet.</p>
          <Link
            href="/monitors"
            className="mt-2 inline-block text-sm font-medium text-zinc-900 underline"
          >
            Create your first monitor
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
          {userMonitors.map((m) => {
            const last = latestByMonitor.get(m.id);
            const status = last ? (last.success ? "up" : "down") : "unknown";
            return (
              <li key={m.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <StatusBadge status={status} />
                  <div>
                    <Link
                      href={`/monitors/${m.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {m.name}
                    </Link>
                    <p className="text-xs text-zinc-500">{m.url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-zinc-500">
                  {last ? <span>{last.latencyMs} ms</span> : <span>—</span>}
                  <Link
                    href={`/status/${m.slug}`}
                    className="text-zinc-400 hover:text-zinc-700"
                  >
                    /status/{m.slug}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
