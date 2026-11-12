import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getTestDatabaseUrl, verifyTestDatabase, withTestTransaction } from "../helpers/test-database";
import { insertRow } from "../helpers/database-fixtures";

describe("Integration database safety", () => {
  // Configuration rejection happens before connecting and never exposes the URL.
  it.each([undefined, "invalid", "https://localhost/looply_test", "postgresql://localhost/looply_dev", "postgresql://localhost/looply_prod", "postgresql://localhost/looply_test?dbname=looply_dev"])("rejects unsafe URL case %#", (url) => {
    const original = process.env.TEST_DATABASE_URL;
    try {
      if (url === undefined) delete process.env.TEST_DATABASE_URL;
      else process.env.TEST_DATABASE_URL = url;
      expect(() => getTestDatabaseUrl()).toThrow();
    } finally {
      if (original === undefined) delete process.env.TEST_DATABASE_URL;
      else process.env.TEST_DATABASE_URL = original;
    }
  });

  // Check the actual target on each connection; transaction helpers never commit.
  it("rolls back inserted data after success and after an exception", async () => {
    for (const fail of [false, true]) {
      const id = randomUUID();
      const run = withTestTransaction(async (client) => {
        await verifyTestDatabase(client);
        await insertRow(client, "provinces", { id, code: randomUUID().slice(0, 30), name: "Rollback check", updatedAt: new Date() });
        if (fail) throw new Error("Expected rollback trigger");
      });
      if (fail) await expect(run).rejects.toThrow("Expected rollback trigger");
      else await run;
      await withTestTransaction(async (client) => {
        const result = await client.query("SELECT id FROM provinces WHERE id = $1", [id]);
        expect(result.rowCount).toBe(0);
      });
    }
  });
});
