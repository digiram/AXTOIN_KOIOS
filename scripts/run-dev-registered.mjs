/**
 * Wraps a dev command started via `pnpm run`, registers its child PID, and forwards shutdown signals.
 *
 * Usage: node scripts/run-dev-registered.mjs <service-label> <command> [args...]
 * Example: node scripts/run-dev-registered.mjs @starter/api tsx watch src/index.ts
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { findRepoRoot, registerDevProcess, unregisterDevProcess } from "./dev-process-registry.mjs";

const service = process.argv[2];
const cmd = process.argv[3];
const args = process.argv.slice(4);

if (!service || !cmd) {
  console.error("Usage: run-dev-registered.mjs <service> <command> [args...]");
  process.exit(1);
}

/** @param {string} command */
function resolveLocalBin(command) {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd);
  const winExt = process.platform === "win32" ? ".cmd" : "";
  const bases = [
    path.join(cwd, "node_modules", ".bin"),
    path.join(repoRoot, "node_modules", ".bin")
  ];
  for (const base of bases) {
    const withExt = path.join(base, `${command}${winExt}`);
    if (fs.existsSync(withExt)) return withExt;
    const plain = path.join(base, command);
    if (fs.existsSync(plain)) return plain;
  }
  return command;
}

/** @param {import("node:module").Require} req @param {string} packageName @param {string} [binName] */
function resolvePackageBin(req, packageName, binName = packageName) {
  const pkgPath = req.resolve(`${packageName}/package.json`);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const bin = pkg.bin;
  const rel = typeof bin === "string" ? bin : bin?.[binName];
  if (!rel) throw new Error(`No bin "${binName}" in ${packageName}`);
  return path.join(path.dirname(pkgPath), rel);
}

/** @param {string} command @param {string[]} commandArgs */
function resolveSpawn(command, commandArgs) {
  const tryRequire = (dir) => {
    try {
      return createRequire(path.join(dir, "package.json"));
    } catch {
      return null;
    }
  };
  const req = tryRequire(process.cwd()) ?? tryRequire(findRepoRoot());
  if (req) {
    if (command === "tsx") {
      return { file: process.execPath, args: [req.resolve("tsx/cli"), ...commandArgs] };
    }
    if (command === "vite") {
      return {
        file: process.execPath,
        args: [resolvePackageBin(req, "vite"), ...commandArgs]
      };
    }
  }
  return { file: resolveLocalBin(command), args: commandArgs };
}

const executable = resolveSpawn(cmd, args);
const commandLine = [cmd, ...args].join(" ");
/** @type {import("node:child_process").ChildProcess | null} */
let child = null;
let exiting = false;

const cleanup = (code) => {
  if (child?.pid) unregisterDevProcess(child.pid);
  if (!exiting) {
    exiting = true;
    process.exit(code ?? 0);
  }
};

child = spawn(executable.file, executable.args, {
  stdio: "inherit",
  env: process.env
});

if (child.pid) {
  try {
    registerDevProcess({ pid: child.pid, service, command: commandLine });
  } catch (err) {
    console.warn(
      `[dev-registry] Could not register ${service} (pid ${child.pid}); dev server will still start.`,
      err
    );
  }
}

child.on("exit", (code, signal) => {
  if (child?.pid) unregisterDevProcess(child.pid);
  if (exiting) return;
  exiting = true;
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error(err);
  cleanup(1);
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    if (!child || child.killed) return;
    child.kill(signal);
  });
}
