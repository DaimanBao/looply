import { z } from "zod";

/** Chỉ chấp nhận web origin chuẩn, không chứa thông tin xác thực, đường dẫn hoặc query parameter. */
function isWebOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

const originsSchema = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .refine((origins) => origins.every(isWebOrigin))
  .transform((origins) => [...new Set(origins.map((origin) => new URL(origin).origin))]);

export const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  DATABASE_URL: z.string().optional(),
  TEST_DATABASE_URL: z.string().optional(),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1).max(60000).default(5000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CORS_ORIGINS: originsSchema,
  CORS_CREDENTIALS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  JSON_BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024)
    .default(1024 * 1024),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1).max(2147483647).default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000000).default(100),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1).max(120000).default(10000),
});

export type Environment = z.infer<typeof environmentSchema>["NODE_ENV"];
