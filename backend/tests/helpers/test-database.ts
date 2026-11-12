import "dotenv/config";
import { Client } from "pg";

/** Rejects non-test URLs without including credentials in errors. */
export function getTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error("TEST_DATABASE_URL is required");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a PostgreSQL URL");
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== "/looply_test") {
    throw new Error("Integration tests must use looply_test");
  }
  // Connection options must not override the database selected by the URL.
  if (url.searchParams.has("dbname") || url.searchParams.has("database")) {
    throw new Error("Database overrides are forbidden in TEST_DATABASE_URL");
  }
  return value;
}

/** Verifies the actual server database on the same connection before any writes. */
export async function verifyTestDatabase(client: Client): Promise<void> {
  const result = await client.query<{ database_name: string }>(
    "SELECT current_database() AS database_name",
  );
  if (result.rows[0]?.database_name !== "looply_test") {
    throw new Error("Refusing writes outside looply_test");
  }
}

/** Runs one isolated test and rolls back even when a constraint aborts the transaction. */
export async function withTestTransaction(run: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client({ connectionString: getTestDatabaseUrl(), connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await verifyTestDatabase(client);
    await client.query("BEGIN");
    try {
      await run(client);
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    await client.end();
  }
}
