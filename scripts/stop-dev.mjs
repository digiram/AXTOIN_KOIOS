/**
 * `pnpm stop` — gracefully stop dev processes registered from `pnpm run`, and optionally
 * kill other discovered app processes (interactive menu).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  findRepoRoot,
  isProcessAlive,
  listAliveRegisteredProcesses
} from "./dev-process-registry.mjs";

const GRACEFUL_TIMEOUT_MS = 12_000;
const DEFAULT_WEB_PORT = 5173;
const DEFAULT_API_PORT = 3500;

/** @typedef {{ pid: number; kind: "registered" | "discovered"; service: string; port?: number; command?: string }} StopCandidate */

/** @param {string} repoRoot */
function loadEnvFile(repoRoot) {
  const envPath = path.join(repoRoot, ".env");
  /** @type {Record<string, string>} */
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** @param {number} port */
function getListeningPids(port) {
  if (process.platform === "win32") {
    try {
      const out = execSync("netstat -ano -p tcp", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const pids = new Set();
      const needle = `:${port}`;
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes("LISTENING") || !line.includes(needle)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts.at(-1));
        if (Number.isInteger(pid) && pid > 0) pids.add(pid);
      }
      return [...pids];
    } catch {
      return [];
    }
  }
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return out
      .split(/\r?\n/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

/** @returns {{ pid: number; command: string }[]} */
function listNodeProcesses() {
  if (process.platform === "win32") {
    try {
      const ps = [
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\"",
        "| Select-Object ProcessId,CommandLine",
        "| ConvertTo-Json -Compress"
      ].join(" ");
      const out = execSync(`powershell -NoProfile -Command "${ps}"`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }).trim();
      if (!out) return [];
      const parsed = JSON.parse(out);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows
        .map((row) => ({
          pid: Number(row.ProcessId),
          command: String(row.CommandLine ?? "")
        }))
        .filter((row) => Number.isInteger(row.pid) && row.pid > 0);
    } catch {
      return [];
    }
  }
  try {
    const out = execSync("ps -ax -o pid=,command=", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return out
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const space = trimmed.indexOf(" ");
        if (space <= 0) return null;
        const pid = Number(trimmed.slice(0, space));
        const command = trimmed.slice(space + 1).trim();
        if (!Number.isInteger(pid) || pid <= 0) return null;
        if (!/node/i.test(command)) return null;
        return { pid, command };
      })
      .filter((row) => row != null);
  } catch {
    return [];
  }
}

/** @param {string} command @param {string} repoRoot */
function commandMatchesRepo(command, repoRoot) {
  const normalized = command.replace(/\\/g, "/").toLowerCase();
  const root = repoRoot.replace(/\\/g, "/").toLowerCase();
  return (
    normalized.includes(root) &&
    /apps\/(api|web|worker|mobile)/.test(normalized)
  );
}

/** @param {string} command @param {string} repoRoot */
function inferServiceFromCommand(command, repoRoot) {
  const normalized = command.replace(/\\/g, "/");
  const root = repoRoot.replace(/\\/g, "/").toLowerCase();
  const lower = normalized.toLowerCase();
  if (lower.includes("@starter/api") || lower.includes(`${root}/apps/api`)) return "@starter/api";
  if (lower.includes("@starter/web") || lower.includes(`${root}/apps/web`)) return "@starter/web";
  if (lower.includes("@starter/worker") || lower.includes(`${root}/apps/worker`)) return "@starter/worker";
  if (lower.includes("@starter/mobile") || lower.includes(`${root}/apps/mobile`)) return "@starter/mobile";
  return "node (app)";
}

/** @param {string} repoRoot @param {Set<number>} registeredPids */
function discoverProcesses(repoRoot, registeredPids) {
  const env = loadEnvFile(repoRoot);
  const apiPort = Number(env.API_PORT || env.PORT) || DEFAULT_API_PORT;
  const webPort = Number(env.VITE_DEV_PORT || env.WEB_PORT) || DEFAULT_WEB_PORT;
  /** @type {Map<number, StopCandidate>} */
  const found = new Map();

  for (const port of [apiPort, webPort]) {
    for (const pid of getListeningPids(port)) {
      if (registeredPids.has(pid) || pid === process.pid) continue;
      found.set(pid, {
        pid,
        kind: "discovered",
        service: port === apiPort ? `@starter/api (port ${port})` : `@starter/web (port ${port})`,
        port
      });
    }
  }

  for (const { pid, command } of listNodeProcesses()) {
    if (registeredPids.has(pid) || pid === process.pid) continue;
    if (!commandMatchesRepo(command, repoRoot) && !/@starter\/(api|web|worker|mobile)/i.test(command)) {
      continue;
    }
    if (!found.has(pid)) {
      found.set(pid, {
        pid,
        kind: "discovered",
        service: inferServiceFromCommand(command, repoRoot),
        command: command.length > 120 ? `${command.slice(0, 117)}...` : command
      });
    }
  }

  return [...found.values()].sort((a, b) => a.pid - b.pid);
}

/** @param {number} pid @param {string} signal */
async function signalProcess(pid, signal) {
  if (!isProcessAlive(pid)) return true;
  try {
    process.kill(pid, signal);
  } catch {
    return false;
  }
  const deadline = Date.now() + GRACEFUL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return !isProcessAlive(pid);
}

/** @param {StopCandidate[]} candidates @param {"SIGTERM" | "SIGKILL"} signal */
async function stopCandidates(candidates, signal) {
  for (const item of candidates) {
    const verb = signal === "SIGTERM" ? "Stopping" : "Killing";
    process.stdout.write(`${verb} ${item.service} (PID ${item.pid})... `);
    const stopped = await signalProcess(item.pid, signal);
    console.log(stopped ? "done" : "still running");
    if (!stopped && signal === "SIGTERM") {
      process.stdout.write(`  Retrying with SIGKILL... `);
      const killed = await signalProcess(item.pid, "SIGKILL");
      console.log(killed ? "done" : "failed");
    }
  }
}

/** @param {StopCandidate} item */
function formatCandidate(item, index) {
  const port = item.port != null ? `  port ${item.port}` : "";
  const cmd = item.command ? `\n      ${item.command}` : "";
  return `  [${index}] ${item.service}  PID ${item.pid}${port}  (${item.kind})${cmd}`;
}

function printHelp() {
  console.log(`Usage: pnpm stop [options]

Options:
  --all, -a       Gracefully stop all registered dev processes (non-interactive)
  --yes, -y       With --all, skip confirmation
  --help, -h      Show this help

Without flags, shows an interactive menu:
  - Gracefully stop processes registered from pnpm run (SIGTERM, then SIGKILL)
  - Optionally kill other discovered app processes on known ports / command lines`);
}

/** @param {string[]} argv */
async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const repoRoot = findRepoRoot();
  const registered = listAliveRegisteredProcesses(repoRoot).map(
    /** @returns {StopCandidate} */ (p) => ({
      pid: p.pid,
      kind: "registered",
      service: p.service,
      port: p.port,
      command: p.command
    })
  );
  const registeredPids = new Set(registered.map((p) => p.pid));
  const discovered = discoverProcesses(repoRoot, registeredPids);
  const all = [...registered, ...discovered];

  if (argv.includes("--all") || argv.includes("-a")) {
    if (registered.length === 0) {
      console.log("No registered dev processes are running.");
      if (discovered.length > 0) {
        console.log(`Found ${discovered.length} unregistered process(es). Run pnpm stop without --all to review them.`);
      }
      return;
    }
    const skipConfirm = argv.includes("--yes") || argv.includes("-y");
    if (!skipConfirm) {
      const rl = readline.createInterface({ input, output });
      const answer = await rl.question(
        `Gracefully stop ${registered.length} registered process(es)? [y/N] `
      );
      rl.close();
      if (!/^y(es)?$/i.test(answer.trim())) {
        console.log("Cancelled.");
        return;
      }
    }
    await stopCandidates(registered, "SIGTERM");
    return;
  }

  if (all.length === 0) {
    console.log("No running dev processes found (registered or discovered).");
    return;
  }

  console.log("\nRunning dev processes:\n");
  all.forEach((item, i) => console.log(formatCandidate(item, i + 1)));

  console.log(`
Actions:
  r, registered   Gracefully stop all registered (pnpm run) processes
  a, all          Gracefully stop every process listed above
  <numbers>       Stop selected items (e.g. 1,3)
  q, quit         Exit without changes`);

  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question("\nChoice: ")).trim().toLowerCase();
  rl.close();

  if (!answer || answer === "q" || answer === "quit") {
    console.log("No changes made.");
    return;
  }

  /** @type {StopCandidate[]} */
  let targets = [];
  if (answer === "r" || answer === "registered") {
    targets = registered;
    if (targets.length === 0) {
      console.log("No registered processes to stop.");
      return;
    }
  } else if (answer === "a" || answer === "all") {
    targets = all;
  } else {
    const picks = answer
      .split(/[,\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= all.length);
    if (picks.length === 0) {
      console.log("No valid selection.");
      return;
    }
    targets = [...new Set(picks)].map((n) => all[n - 1]);
  }

  const hasDiscovered = targets.some((t) => t.kind === "discovered");
  if (hasDiscovered) {
    const rl2 = readline.createInterface({ input, output });
    const confirm = await rl2.question(
      "Selection includes discovered (unregistered) processes. Force-stop them if needed? [y/N] "
    );
    rl2.close();
    if (!/^y(es)?$/i.test(confirm.trim())) {
      console.log("Cancelled.");
      return;
    }
  }

  await stopCandidates(targets, "SIGTERM");
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(1);
});
