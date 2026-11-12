import type { Environment } from "./environment.schema";

const databaseNames: Record<Environment, string> = {
  development: "looply_dev", test: "looply_test", production: "looply_prod",
};

/** Enforces the project database boundary without exposing the supplied connection string. */
export function validateDatabaseUrl(value: string | undefined, environment: Environment): string {
  if (!value) throw new Error("Missing database configuration");
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)
      || url.pathname !== `/${databaseNames[environment]}`
      || url.searchParams.has("dbname") || url.searchParams.has("database")) {
      throw new Error("Invalid target");
    }
    if (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public") {
      throw new Error("Invalid schema");
    }
    return value;
  } catch {
    throw new Error("Invalid database configuration for the selected environment");
  }
}
