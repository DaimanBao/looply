export interface InspectorConfig {
  enabled: boolean;
  port: number;
  key: string;
}

/** Explicit opt-in only; attempted enablement outside development fails before startup. */
export function inspectorConfig(
  environment: string,
  input: NodeJS.ProcessEnv,
): InspectorConfig | undefined {
  const enabled = input.DEV_OTP_INSPECTOR_ENABLED;
  if (enabled === undefined || enabled === "false") return undefined;
  if (
    environment !== "development" ||
    input.NODE_ENV === "production" ||
    enabled !== "true"
  )
    throw new Error("OTP inspector is development-only");
  const key = input.DEV_OTP_INSPECTOR_KEY || "";
  const port = Number(input.DEV_OTP_INSPECTOR_PORT || "3101");
  if (
    key.length < 48 ||
    key === input.AUTH_JWT_SECRET ||
    key === input.AUTH_OTP_PEPPER ||
    !/^[A-Za-z0-9_-]+$/.test(key) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw new Error("Invalid OTP inspector configuration");
  return { enabled: true, key, port };
}
