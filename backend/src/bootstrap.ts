import { createServer } from "node:http";
import { createApp } from "./app";
import type { AppConfig } from "./config/environment";
import { createServerRuntime } from "./runtime/server-runtime";
import { createPrismaClient } from "./shared/database/prisma";
import { createLogger } from "./shared/logger/logger";
import type { AuthConfig } from "./config/auth-config";
import { createFeatures } from "./features";
import { CleanupLoop } from "./jobs/cleanup-loop";

/** Khai báo rõ các phụ thuộc production; tài nguyên chỉ mở khi runtime.start() chạy. */
export function createBackend(config: AppConfig, authConfig: AuthConfig) {
  if (
    !config.http.corsCredentials ||
    authConfig.origins.some((origin) => !config.http.corsOrigins.includes(origin))
  )
    throw new Error("Auth cookie origins must be allowed by credentialed CORS configuration");
  const logger = createLogger(config.logLevel);
  const database = createPrismaClient(config);
  const features = createFeatures(database, authConfig);
  const cleanup = new CleanupLoop(features.cleanup, logger);
  const app = createApp({ config: config.http, logger, featureRouters: features.routers });
  const server = createServer(app);
  const runtime = createServerRuntime({
    server,
    database,
    logger,
    config,
    services: {
      /** Redis phải sẵn sàng trước khi nhận yêu cầu xác thực; worker chỉ chạy sau khi các phụ thuộc kết nối. */
      async start() {
        await features.redis.connect();
        cleanup.start();
      },
      /** Chờ worker hoàn tất thao tác storage/database trước khi ngắt Redis và Prisma. */
      async stop() {
        await cleanup.stop();
        await features.redis.close();
      },
    },
  });
  return { app, database, logger, runtime, features, server };
}
