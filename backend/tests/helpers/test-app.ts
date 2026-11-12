import type { Router } from "express";
import { createApp } from "../../src/app";
import type { HttpConfig } from "../../src/config/environment";
import { createLogger } from "../../src/shared/logger/logger";

/** Builds an HTTP-only app with no environment loading, Prisma client construction or database connection. */
export function createTestApp(options: { config?: Partial<HttpConfig>; featureRouters?: Router[] } = {}) {
  const config: HttpConfig = {
    corsOrigins: [], corsCredentials: false, jsonBodyLimitBytes: 1024,
    rateLimitWindowMs: 60000, rateLimitMax: 1000, ...options.config,
  };
  return createApp({ config, logger: createLogger("silent"), featureRouters: options.featureRouters });
}
