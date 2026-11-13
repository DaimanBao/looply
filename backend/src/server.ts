import "dotenv/config";
import { createBackend } from "./bootstrap";
import { loadConfig } from "./config/environment";
import { loadAuthConfig } from "./config/auth-config";

/** Starts the composed backend and keeps process signals outside the reusable HTTP app. */
async function main(): Promise<void> {
  const config = loadConfig();
  const backend = createBackend(config, loadAuthConfig(process.env, config.environment));
  let stopping = false;

  /** Drains resources once; a failed deadline requires a final forced process exit. */
  async function shutdown(): Promise<void> {
    if (stopping) return;
    stopping = true;
    try {
      await backend.runtime.stop();
      process.exitCode = 0;
    } catch {
      backend.logger.fatal({ code: "SHUTDOWN_FAILED" }, "Backend could not stop safely");
      process.exit(1);
    }
  }

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  await backend.runtime.start();
}

// Never serialize configuration, connection errors or arbitrary exception messages at startup.
main().catch(() => {
  console.error("Backend startup failed. Check configuration and database availability.");
  process.exitCode = 1;
});
