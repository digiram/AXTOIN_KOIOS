/**
 * Dev process registry for `pnpm run` wrappers and app readiness hooks.
 * Persists under `.dev/processes.json` at the repo root (gitignored).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @typedef {{ pid: number; service: string; command?: string; port?: number; registeredAt: string; readyAt?: string }} DevProcessEntry */

/** @returns {string} */
export function findRepoRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not find repo root (pnpm-workspace.yaml)");
}

/** @returns {string} */
export function getRegistryPath(repoRoot = findRepoRoot()) {
  return path.join(repoRoot, ".dev", "processes.json");
}

/** @returns {{ processes: DevProcessEntry[] }} */
export function readRegistry(repoRoot = findRepoRoot()) {
  const file = getRegistryPath(repoRoot);
  if (!fs.existsSync(file)) return { processes: [] };
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.processes)) return { processes: [] };
    return { processes: parsed.processes };
  } catch {
    return { processes: [] };
  }
}

/** @param {NodeJS.ErrnoException} err */
function isRetryableRegistryError(err) {
  return err.code === "EPERM" || err.code === "EACCES" || err.code === "EBUSY" || err.code === "EEXIST";
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Dev-only brief spin while waiting on the registry lock or rename retry.
  }
}

/** @param {string} lockPath */
function tryClearStaleRegistryLock(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, "utf8").trim();
    const pid = Number(raw);
    if (Number.isInteger(pid) && pid > 0 && !isProcessAlive(pid)) {
      fs.unlinkSync(lockPath);
    }
  } catch {
    // Ignore unreadable or already-removed lock files.
  }
}

/** @param {() => T} fn @template T */
function withRegistryLock(fn, repoRoot = findRepoRoot()) {
  const lockPath = `${getRegistryPath(repoRoot)}.lock`;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  const deadline = Date.now() + 5_000;
  /** @type {number | null} */
  let lockFd = null;
  while (Date.now() < deadline) {
    try {
      lockFd = fs.openSync(lockPath, "wx");
      break;
    } catch (err) {
      const code = /** @type {NodeJS.ErrnoException} */ (err).code;
      if (code !== "EEXIST") throw err;
      tryClearStaleRegistryLock(lockPath);
      sleepSync(25);
    }
  }

  if (lockFd == null) {
    throw new Error(`Timed out acquiring dev process registry lock (${lockPath})`);
  }

  try {
    fs.writeFileSync(lockFd, String(process.pid));
    return fn();
  } finally {
    try {
      fs.closeSync(lockFd);
    } catch {
      // Ignore close races during shutdown.
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Another process may have already removed the lock.
    }
  }
}

/** @param {{ processes: DevProcessEntry[] }} data */
function writeRegistry(data, repoRoot = findRepoRoot()) {
  const file = getRegistryPath(repoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;

  for (let attempt = 0; attempt < 20; attempt++) {
    fs.writeFileSync(tmp, payload, "utf8");
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      const retryable = isRetryableRegistryError(/** @type {NodeJS.ErrnoException} */ (err));
      try {
        fs.unlinkSync(tmp);
      } catch {
        // Ignore cleanup races.
      }
      if (!retryable || attempt === 19) throw err;
      sleepSync(25 * (attempt + 1));
    }
  }
}

/** @param {number} pid */
export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    return code === "EPERM";
  }
}

/** @param {{ pid: number; service: string; command?: string }} entry */
export function registerDevProcess(entry, repoRoot = findRepoRoot()) {
  withRegistryLock(() => {
    const data = readRegistry(repoRoot);
    const now = new Date().toISOString();
    const existing = data.processes.find((p) => p.pid === entry.pid);
    if (existing) {
      existing.service = entry.service;
      if (entry.command) existing.command = entry.command;
      existing.registeredAt = existing.registeredAt || now;
    } else {
      data.processes.push({
        pid: entry.pid,
        service: entry.service,
        command: entry.command,
        registeredAt: now
      });
    }
    writeRegistry(data, repoRoot);
  }, repoRoot);
}

/** @param {{ pid: number; port?: number }} update */
export function markDevProcessReady(update, repoRoot = findRepoRoot()) {
  withRegistryLock(() => {
    const data = readRegistry(repoRoot);
    const now = new Date().toISOString();
    let row = data.processes.find((p) => p.pid === update.pid);
    if (!row) {
      row = {
        pid: update.pid,
        service: "unknown",
        registeredAt: now
      };
      data.processes.push(row);
    }
    if (update.port != null) row.port = update.port;
    row.readyAt = now;
    writeRegistry(data, repoRoot);
  }, repoRoot);
}

/** @param {number} pid */
export function unregisterDevProcess(pid, repoRoot = findRepoRoot()) {
  withRegistryLock(() => {
    const data = readRegistry(repoRoot);
    const next = data.processes.filter((p) => p.pid !== pid);
    if (next.length === data.processes.length) return;
    writeRegistry({ processes: next }, repoRoot);
  }, repoRoot);
}

/** @returns {DevProcessEntry[]} */
export function listAliveRegisteredProcesses(repoRoot = findRepoRoot()) {
  return withRegistryLock(() => {
    const data = readRegistry(repoRoot);
    const alive = data.processes.filter((p) => isProcessAlive(p.pid));
    if (alive.length !== data.processes.length) {
      writeRegistry({ processes: alive }, repoRoot);
    }
    return alive;
  }, repoRoot);
}
