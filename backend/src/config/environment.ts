import { environmentSchema, type Environment } from "./environment.schema";
import { validateDatabaseUrl } from "./database-url";

export type HttpConfig = {
  corsOrigins: string[];
  corsCredentials: boolean;
  jsonBodyLimitBytes: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
};

export type AppConfig = {
  environment: Environment;
  host: string;
  port: number;
  databaseUrl: string;
  databaseConnectTimeoutMs: number;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  shutdownTimeoutMs: number;
  http: HttpConfig;
};

/** Phân tích biến môi trường một lần; chế độ test chỉ chọn TEST_DATABASE_URL. */
export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid environment configuration: ${keys.join(", ")}`);
  }
  const input = result.data;
  const databaseUrl = validateDatabaseUrl(
    input.NODE_ENV === "test" ? input.TEST_DATABASE_URL : input.DATABASE_URL,
    input.NODE_ENV,
  );
  return {
    environment: input.NODE_ENV,
    host: input.HOST,
    port: input.PORT,
    databaseUrl,
    databaseConnectTimeoutMs: input.DATABASE_CONNECT_TIMEOUT_MS,
    logLevel: input.LOG_LEVEL,
    shutdownTimeoutMs: input.SHUTDOWN_TIMEOUT_MS,
    http: {
      corsOrigins: input.CORS_ORIGINS,
      corsCredentials: input.CORS_CREDENTIALS,
      jsonBodyLimitBytes: input.JSON_BODY_LIMIT_BYTES,
      rateLimitWindowMs: input.RATE_LIMIT_WINDOW_MS,
      rateLimitMax: input.RATE_LIMIT_MAX,
    },
  };
}
