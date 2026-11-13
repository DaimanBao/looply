import type { Router } from "express";
import { createApp } from "../../src/app";
import type { HttpConfig } from "../../src/config/environment";
import { createLogger } from "../../src/shared/logger/logger";

/** Tạo app chỉ HTTP, không nạp môi trường, tạo Prisma client hoặc kết nối database. */
export function createTestApp(
  options: { config?: Partial<HttpConfig>; featureRouters?: Router[] } = {},
) {
  const config: HttpConfig = {
    corsOrigins: [],
    corsCredentials: false,
    jsonBodyLimitBytes: 1024,
    rateLimitWindowMs: 60000,
    rateLimitMax: 1000,
    ...options.config,
  };
  return createApp({
    config,
    logger: createLogger("silent"),
    featureRouters: options.featureRouters,
  });
}
