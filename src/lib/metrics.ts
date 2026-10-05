import "server-only";

type Labels = Record<string, string>;

type Entry = {
  name: string;
  help: string;
  type: "counter" | "gauge";
  labels: Labels;
  value: number;
};

const registry = new Map<string, Entry>();

function key(name: string, labels: Labels): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return `${name}::${JSON.stringify(entries)}`;
}

function ensure(
  name: string,
  help: string,
  type: "counter" | "gauge",
  labels: Labels,
): Entry {
  const k = key(name, labels);
  let entry = registry.get(k);
  if (!entry) {
    entry = { name, help, type, labels, value: 0 };
    registry.set(k, entry);
  }
  return entry;
}

export function inc(name: string, value = 1, labels: Labels = {}): void {
  ensure(name, "", "counter", labels).value += value;
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

export function renderMetrics(): string {
  const lines: string[] = [];
  const emittedHelp = new Set<string>();

  for (const entry of registry.values()) {
    if (!emittedHelp.has(entry.name)) {
      emittedHelp.add(entry.name);
      if (entry.help) lines.push(`# HELP ${entry.name} ${entry.help}`);
      lines.push(`# TYPE ${entry.name} ${entry.type}`);
    }
    const labelStr = Object.entries(entry.labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    const suffix = labelStr ? `{${labelStr}}` : "";
    lines.push(`${entry.name}${suffix} ${format(entry.value)}`);
  }

  const mem = process.memoryUsage();
  lines.push("# HELP process_resident_memory_bytes Resident memory size in bytes");
  lines.push("# TYPE process_resident_memory_bytes gauge");
  lines.push(`process_resident_memory_bytes ${mem.rss}`);
  lines.push("# HELP process_uptime_seconds Seconds since process start");
  lines.push("# TYPE process_uptime_seconds gauge");
  lines.push(`process_uptime_seconds ${process.uptime().toFixed(3)}`);

  return lines.join("\n") + "\n";
}
