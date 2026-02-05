import "dotenv/config";
import { ENABLE_QMD } from "./config.js";
import { updateIndex } from "./memory/search.js";
import { createScheduler } from "./scheduler.js";

const INDEX_REFRESH_MS = Number(process.env.COGITO_INDEX_REFRESH_MS ?? "900000");
const HEARTBEAT_MS = Number(process.env.COGITO_HEARTBEAT_MS ?? "0");

function log(message: string) {
  const ts = new Date().toISOString();
  console.log(`[daemon ${ts}] ${message}`);
}

async function main() {
  log("Cogito daemon starting");

  const tasks = [
    {
      name: "index-refresh",
      intervalMs: INDEX_REFRESH_MS,
      enabled: ENABLE_QMD,
      run: async () => {
        await updateIndex();
        log("index refreshed");
      },
    },
  ];

  if (HEARTBEAT_MS > 0) {
    tasks.push({
      name: "heartbeat",
      intervalMs: HEARTBEAT_MS,
      run: () => {
        log("alive");
      },
    });
  }

  const scheduler = createScheduler(tasks);

  const shutdown = () => {
    log("shutting down");
    scheduler.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal: ${message}`);
  process.exit(1);
});
