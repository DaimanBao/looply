import pino, { type DestinationStream, type Logger } from "pino";
import type { AppConfig } from "../../config/environment";

/** Creates structured logging with defense-in-depth removal of known sensitive fields. */
export function createLogger(level: AppConfig["logLevel"], destination?: DestinationStream): Logger {
  return pino({
    level,
    base: { service: "looply-backend" },
    serializers: { err: () => ({ code: "INTERNAL_ERROR" }) },
    redact: {
      paths: [
        "password", "passwordHash", "otp", "codeHash", "token", "accessToken", "refreshToken",
        "refreshTokenHash", "secret", "apiKey", "authorization", "cookie", "databaseUrl", "connectionString", "DATABASE_URL", "TEST_DATABASE_URL",
        "*.password", "*.passwordHash", "*.otp", "*.token", "*.accessToken", "*.refreshToken", "*.refreshTokenHash",
        "*.codeHash", "*.secret", "*.apiKey", "*.authorization", "*.cookie", "*.databaseUrl", "*.connectionString",
        "headers.authorization", "headers.cookie", "req.headers.authorization", "req.headers.cookie",
        "req.body", "req.query", 'res.headers["set-cookie"]',
      ], remove: true,
    },
  }, destination);
}
