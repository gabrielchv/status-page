export type Status = "up" | "down" | "unknown";

const styles: Record<Status, string> = {
  up: "bg-emerald-50 text-emerald-700 border-emerald-300",
  down: "bg-red-50 text-red-700 border-red-300",
  unknown: "bg-zinc-100 text-zinc-500 border-zinc-300",
};

const labels: Record<Status, string> = {
  up: "Operational",
  down: "Down",
  unknown: "No data",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      <span className="relative flex h-2 w-2">
        {status === "up" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            status === "up"
              ? "bg-emerald-500"
              : status === "down"
                ? "bg-red-500"
                : "bg-zinc-400"
          }`}
        />
      </span>
      {labels[status]}
    </span>
  );
}
