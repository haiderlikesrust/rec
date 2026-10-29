/**
 * Container entrypoint (PID 1). Publishes this build's static files, then runs the backend and the Next server
 * side by side. SIGTERM (Swarm stopping this container after the new one is healthy) goes to both: the backend
 * finishes its running job and releases the background-work lease, Next finishes open requests. If either one
 * dies on its own, the other is stopped too, so the container exits and Swarm replaces it.
 */
import { spawn } from "node:child_process";

await import("./publish-static.mjs");

const env = { ...process.env, PORT: process.env.BACKEND_PORT ?? "42069" };
const children = [
  spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", "tsx", "src/index.ts"], {
    cwd: "backend",
    stdio: "inherit",
    env,
  }),
  spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", process.env.PORT ?? "7310"], {
    cwd: "web",
    stdio: "inherit",
    env: process.env,
  }),
];

let stopping = false;
let exitCode = 0;
const stop = (signal) => {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill(signal);
  // Swarm sends SIGKILL after its grace period anyway; don't outlive it
  setTimeout(() => process.exit(exitCode || 1), 12_000).unref();
};
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

let alive = children.length;
for (const c of children)
  c.on("exit", (code) => {
    alive--;
    if (!stopping) {
      console.error(`[start] ${c.spawnargs.slice(-4).join(" ")} exited (${code}); stopping the container`);
      exitCode = code || 1;
      stop("SIGTERM");
    }
    if (alive === 0) process.exit(exitCode);
  });
