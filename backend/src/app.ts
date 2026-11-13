import express, { type Express, type Router } from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import type { HttpConfig } from "./config/environment";
import { createHealthRouter } from "./routes/health.routes";
import { createCors } from "./shared/middleware/cors";
import { createErrorHandler } from "./shared/middleware/error-handler";
import { notFound } from "./shared/middleware/not-found";
import { createApiRateLimit } from "./shared/middleware/rate-limit";
import { requestId } from "./shared/middleware/request-id";
import { createRequestLogger } from "./shared/middleware/request-logger";

export type AppDependencies = { config: HttpConfig; logger: Logger; featureRouters?: Router[] };

/** Lắp ghép hành vi HTTP mà không đọc biến môi trường, mở database hoặc lắng nghe kết nối. */
export function createApp({ config, logger, featureRouters = [] }: AppDependencies): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(requestId);
  app.use(helmet());
  app.use(createRequestLogger(logger));
  app.use(createCors(config));
  app.use("/api", createApiRateLimit(config));
  app.use(express.json({ limit: config.jsonBodyLimitBytes }));
  app.use("/api", createHealthRouter(), ...featureRouters);
  app.use(notFound);
  app.use(createErrorHandler(logger));
  return app;
}
