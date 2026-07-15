import { loadWorkerEnv } from "./env";
import { startWorkerRuntime } from "./runtime";

loadWorkerEnv();
const runtime = startWorkerRuntime();

console.log("workers ready");

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`received ${signal}, stopping workers`);
  void runtime.stop().then(
    () => process.exit(0),
    (error: unknown) => {
      console.error("worker shutdown failed", error);
      process.exit(1);
    },
  );
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
