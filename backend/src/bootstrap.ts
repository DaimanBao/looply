import { createServer } from "node:http";
import { createApp } from "./app";
import type { AppConfig } from "./config/environment";
import { createServerRuntime } from "./runtime/server-runtime";
import { createPrismaClient } from "./shared/database/prisma";
import { createLogger } from "./shared/logger/logger";

/** Assembles production dependencies explicitly; no resources open until runtime.start(). */
export function createBackend(config: AppConfig) {
  const logger = createLogger(config.logLevel);
  const database = createPrismaClient(config);
  const app = createApp({ config: config.http, logger });
  const runtime = createServerRuntime({ server: createServer(app), database, logger, config });
  return { app, database, logger, runtime };
}
