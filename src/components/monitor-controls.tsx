"use client";

import { useRouter } from "next/navigation";

export function MonitorControls({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();

  async function toggleActive() {
    await fetch(`/api/monitors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Delete this monitor and all of its check history?")) return;
    await fetch(`/api/monitors/${id}`, { method: "DELETE" });
    router.push("/monitors");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleActive}
        className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
          active
            ? "border-zinc-300 text-zinc-700 hover:bg-zinc-100"
            : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
        }`}
      >
        {active ? "Pause" : "Resume"}
      </button>
      <button
        onClick={remove}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Delete
      </button>
    </div>
  );
}
