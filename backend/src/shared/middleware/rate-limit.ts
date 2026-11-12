import { rateLimit } from "express-rate-limit";
import type { HttpConfig } from "../../config/environment";
import { rateLimitHandler } from "./rate-limit-handler";

/** Uses one process-local quota store per app; no proxy headers are trusted by the app. */
export function createApiRateLimit(config: HttpConfig) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs, limit: config.rateLimitMax,
    standardHeaders: "draft-8", legacyHeaders: false,
    handler: rateLimitHandler,
  });
}
