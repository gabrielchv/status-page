"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type MonitorInput = {
  id?: string;
  name?: string;
  url?: string;
  expectedStatus?: number;
  timeoutMs?: number;
  intervalSec?: number;
};

export function MonitorForm({ monitor }: { monitor?: MonitorInput }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(monitor?.id);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const formElement = e.currentTarget;
    const payload = {
      name: form.get("name"),
      url: form.get("url"),
      expectedStatus: form.get("expectedStatus") ? Number(form.get("expectedStatus")) : undefined,
      timeoutMs: form.get("timeoutMs") ? Number(form.get("timeoutMs")) : undefined,
      intervalSec: form.get("intervalSec") ? Number(form.get("intervalSec")) : undefined,
    };

    const res = await fetch(editing ? `/api/monitors/${monitor!.id}` : "/api/monitors", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      router.refresh();
      if (!editing) formElement.reset();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
    }

    setPending(false);
  }

  const input =
    "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";
  const label = "block text-sm font-medium text-zinc-700 mb-1";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className={label} htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={monitor?.name}
          placeholder="My website"
          className={input}
        />
      </div>

      <div>
        <label className={label} htmlFor="url">
          URL
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          defaultValue={monitor?.url}
          placeholder="https://example.com"
          className={input}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={label} htmlFor="expectedStatus">
            Expected status
          </label>
          <input
            id="expectedStatus"
            name="expectedStatus"
            type="number"
            min={100}
            max={599}
            defaultValue={monitor?.expectedStatus ?? 200}
            className={input}
          />
        </div>
        <div>
          <label className={label} htmlFor="intervalSec">
            Interval (s)
          </label>
          <input
            id="intervalSec"
            name="intervalSec"
            type="number"
            min={30}
            max={3600}
            defaultValue={monitor?.intervalSec ?? 60}
            className={input}
          />
        </div>
        <div>
          <label className={label} htmlFor="timeoutMs">
            Timeout (ms)
          </label>
          <input
            id="timeoutMs"
            name="timeoutMs"
            type="number"
            min={1000}
            max={120000}
            defaultValue={monitor?.timeoutMs ?? 10000}
            className={input}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : editing ? "Save changes" : "Create monitor"}
      </button>
    </form>
  );
}
