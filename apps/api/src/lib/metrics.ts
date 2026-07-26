/**
 * Lightweight in-process counters for Prometheus text exposition (`GET /metrics`).
 */

type Labels = Record<string, string>;

const counters = new Map<string, number>();

const keyFor = (name: string, labels: Labels): string => {
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${JSON.stringify(labels[k])}`);
  return parts.length > 0 ? `${name}{${parts.join(",")}}` : name;
};

export const incrementCounter = (name: string, labels: Labels = {}, by = 1): void => {
  const k = keyFor(name, labels);
  counters.set(k, (counters.get(k) ?? 0) + by);
};

export const renderPrometheusMetrics = (): string => {
  const lines: string[] = [
    "# HELP starter_http_requests_total Total HTTP requests handled.",
    "# TYPE starter_http_requests_total counter"
  ];
  for (const [k, v] of [...counters.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`${k} ${v}`);
  }
  return `${lines.join("\n")}\n`;
};
