import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(rootDir, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const startProcess = (name, args, cwd) => {
  const child = spawn(npmCommand, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${name}] exited with signal ${signal}`);
    } else {
      console.log(`[${name}] exited with code ${code ?? 0}`);
    }
  });

  return child;
};

const backend = startProcess("backend", ["run", "dev"], path.join(workspaceRoot, "backend"));
const frontend = startProcess("frontend", ["run", "dev"], path.join(workspaceRoot, "frontend"));

const shutdown = (signal) => {
  backend.kill(signal);
  frontend.kill(signal);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

backend.on("exit", (code) => {
  if (code !== null && code !== 0) {
    frontend.kill("SIGTERM");
    process.exitCode = code;
  }
});

frontend.on("exit", (code) => {
  if (code !== null && code !== 0) {
    backend.kill("SIGTERM");
    process.exitCode = code;
  }
});