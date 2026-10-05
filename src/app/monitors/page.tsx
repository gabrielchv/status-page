import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { checks, monitors } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { StatusBadge } from "@/components/status-badge";
import { MonitorForm } from "@/components/monitor-form";

export const dynamic = "force-dynamic";

export default async function MonitorsPage() {
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
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900">Manage monitors</h1>

      <div className="mb-10 rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Add a monitor</h2>
        <MonitorForm />
      </div>

      {userMonitors.length === 0 ? (
        <p className="text-sm text-zinc-500">No monitors created yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
          {userMonitors.map((m) => {
            const last = latestByMonitor.get(m.id);
            const status = last ? (last.success ? "up" : "down") : "unknown";
            return (
              <li key={m.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <StatusBadge status={status} />
                  <Link
                    href={`/monitors/${m.id}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {m.name}
                  </Link>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <Link
                    href={`/status/${m.slug}`}
                    className="text-zinc-400 hover:text-zinc-700"
                  >
                    status page
                  </Link>
                  <Link
                    href={`/monitors/${m.id}`}
                    className="font-medium text-zinc-600 hover:text-zinc-900"
                  >
                    Edit →
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
