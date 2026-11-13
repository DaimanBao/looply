import { z } from "zod";
import type { Environment } from "./environment.schema";

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());
const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const schema = z.object({
  AUTH_JWT_SECRET: z.string().min(48),
  AUTH_OTP_PEPPER: z.string().min(48),
  AUTH_ISSUER: z.string().min(1).default("looply"),
  GOOGLE_CLIENT_ID: z.string().min(1),
  AUTH_IP_LIMIT: z.coerce.number().int().min(1).max(10000).default(60),
  AUTH_IP_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86400).default(60),
  AUTH_PASSWORD_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
  AUTH_PASSWORD_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86400).default(900),
  AUTH_REAUTH_LIMIT: z.coerce.number().int().min(1).max(1000).default(5),
  AUTH_REAUTH_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86400).default(900),
  REDIS_URL: z
    .url()
    .refine(
      (value) => URL.canParse(value) && ["redis:", "rediss:"].includes(new URL(value).protocol),
    ),
  AUTH_ALLOWED_ORIGINS: z.string().min(1),
  SMS_PROVIDER: z.enum(["fake", "http"]).default("fake"),
  EMAIL_PROVIDER: z.enum(["fake", "http"]).default("fake"),
  SMS_PROVIDER_URL: optionalUrl,
  SMS_PROVIDER_KEY: optionalSecret,
  EMAIL_PROVIDER_URL: optionalUrl,
  EMAIL_PROVIDER_KEY: optionalSecret,
  MEDIA_PROVIDER: z.enum(["local", "s3"]).default("local"),
  MEDIA_LOCAL_DIRECTORY: z.string().min(1).default(".local-media"),
  S3_ENDPOINT: optionalUrl,
  S3_BUCKET: optionalSecret,
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: optionalSecret,
  S3_SECRET_ACCESS_KEY: optionalSecret,
});
export type AuthConfig = z.infer<typeof schema> & { environment: Environment; origins: string[] };

/** Kiểm tra cấu hình bảo mật runtime tường minh; lỗi chỉ chứa tên, không chứa giá trị. */
export function loadAuthConfig(input: NodeJS.ProcessEnv, environment: Environment): AuthConfig {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid Auth configuration: ${[...new Set(result.error.issues.map((issue) => issue.path[0]))].join(", ")}`,
    );
  const config = result.data;
  const origins = config.AUTH_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());
  for (const origin of origins) {
    if (!URL.canParse(origin)) throw new Error("Invalid Auth configuration: AUTH_ALLOWED_ORIGINS");
    const parsed = new URL(origin);
    if (
      parsed.origin !== origin ||
      !["http:", "https:"].includes(parsed.protocol) ||
      (environment === "production" && parsed.protocol !== "https:")
    )
      throw new Error("Invalid Auth configuration: AUTH_ALLOWED_ORIGINS");
  }
  if (
    environment === "production" &&
    (config.SMS_PROVIDER === "fake" ||
      config.EMAIL_PROVIDER === "fake" ||
      config.MEDIA_PROVIDER === "local")
  )
    throw new Error("Production requires real message and media providers");
  for (const channel of ["SMS", "EMAIL"] as const) {
    if (
      config[`${channel}_PROVIDER`] === "http" &&
      (!config[`${channel}_PROVIDER_URL`]?.startsWith("https://") ||
        !config[`${channel}_PROVIDER_KEY`])
    )
      throw new Error(`Invalid Auth configuration: ${channel}_PROVIDER`);
  }
  if (
    config.MEDIA_PROVIDER === "s3" &&
    (!config.S3_BUCKET ||
      !config.S3_ACCESS_KEY_ID ||
      !config.S3_SECRET_ACCESS_KEY ||
      !config.S3_ENDPOINT?.startsWith("https://"))
  )
    throw new Error("Invalid Auth configuration: S3 provider");
  if (config.AUTH_JWT_SECRET === config.AUTH_OTP_PEPPER)
    throw new Error("Auth signing key and OTP pepper must be independent");
  if (environment === "test" && !new URL(config.REDIS_URL).pathname.match(/^\/[1-9][0-9]*$/))
    throw new Error("Tests require a dedicated nonzero Redis database");
  return { ...config, environment, origins };
}
