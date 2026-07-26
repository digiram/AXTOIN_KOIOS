/**
 * Dev terminal readiness banner for local processes.
 *
 * Prints Vite-style "ready in N ms" lines to stdout when not in production.
 * Used by API, worker, and web dev servers after boot completes.
 *
 * Responsibilities:
 * - Skip output entirely when `NODE_ENV === "production"`
 * - Format service title, elapsed ms, and labeled connection lines
 */

/** Single labeled line in the dev readiness banner (e.g. Redis host, listen port). */
export type DevReadyLine = { label: string; value: string };

/**
 * Prints dev readiness banner lines to stdout.
 *
 * @param serviceTitle - Package or process name shown in the header line.
 * @param readyMs - Milliseconds from boot start to ready.
 * @param lines - Key/value pairs (Redis URL, queue name, etc.).
 */
export function printDevServiceReady(
  serviceTitle: string,
  readyMs: number,
  lines: readonly DevReadyLine[]
): void {
  if (process.env.NODE_ENV === "production") return;
  console.log("");
  console.log(`  ${serviceTitle}  ready in ${readyMs} ms`);
  for (const { label, value } of lines) {
    console.log(`  ➜  ${label}:   ${value}`);
  }
}
