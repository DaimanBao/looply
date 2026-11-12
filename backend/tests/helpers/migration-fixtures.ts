import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";

export const authUserMigration = "0004_auth_user_preparation";
export const previousMigrations = ["0001_init", "0002_fix_media_duration", "0003_reject_nan_prices"] as const;

/** Reads migration DDL while leaving transaction ownership to the rollback test helper. */
export function migrationSql(name: string): string {
  return readFileSync(resolve(__dirname, "../../prisma/migrations", name, "migration.sql"), "utf8")
    .replace(/^BEGIN;\r?$/gm, "")
    .replace(/^COMMIT;\r?$/gm, "");
}

/** Replays historical DDL inside a rollback-only schema, keeping public tables untouched. */
export async function createMigrationSchema(client: Client): Promise<void> {
  const schema = `migration_test_${randomUUID().replaceAll("-", "")}`;
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}", public`);
  for (const name of previousMigrations) await client.query(migrationSql(name));
}
