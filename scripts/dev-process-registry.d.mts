export type DevProcessEntry = {
  pid: number;
  service: string;
  command?: string;
  port?: number;
  registeredAt: string;
  readyAt?: string;
};

export function findRepoRoot(startDir?: string): string;
export function getRegistryPath(repoRoot?: string): string;
export function readRegistry(repoRoot?: string): { processes: DevProcessEntry[] };
export function isProcessAlive(pid: number): boolean;
export function registerDevProcess(
  entry: { pid: number; service: string; command?: string },
  repoRoot?: string
): void;
export function markDevProcessReady(update: { pid: number; port?: number }, repoRoot?: string): void;
export function unregisterDevProcess(pid: number, repoRoot?: string): void;
export function listAliveRegisteredProcesses(repoRoot?: string): DevProcessEntry[];
