import { describe, expect, it } from "vitest";
import { createFixtures, updateRow } from "../helpers/database-fixtures";
import { withTestTransaction } from "../helpers/test-database";

describe("Database column boundaries and defaults", () => {
  // Check both exact maximum and overflow for every VARCHAR column, keeping each mutation isolated.
  it("enforces all VARCHAR length limits", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const columns = await client.query<{ table_name: string; column_name: string; max_length: number }>(
        `SELECT table_name, column_name, character_maximum_length AS max_length
         FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'character varying'
         AND table_name <> '_prisma_migrations' ORDER BY table_name, ordinal_position`,
      );
      let checked = 0;
      for (const [table, row] of Object.entries(rows)) {
        for (const column of columns.rows.filter((entry) => entry.table_name === table)) {
          await client.query("SAVEPOINT column_boundary");
          const atLimit = await updateRow(client, table as keyof typeof rows, row.id, { [column.column_name]: "a".repeat(column.max_length) });
          expect(atLimit[column.column_name]).toBe("a".repeat(column.max_length));
          await client.query("ROLLBACK TO SAVEPOINT column_boundary");
          await expect(updateRow(client, table as keyof typeof rows, row.id, { [column.column_name]: "a".repeat(column.max_length + 1) }), `${table}.${column.column_name}`).rejects.toMatchObject({ code: "22001" });
          await client.query("ROLLBACK TO SAVEPOINT column_boundary");
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
      expect(checked).toBe(columns.rows.length);
    });
  });

  // Defaults are part of the persistence contract, independent of service implementation.
  it("persists initial status, cycle, counters, timestamps and JSON payload defaults", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      expect(rows.users).toMatchObject({ status: "ACTIVE", deletionRequestedAt: null, usernameChangedAt: null });
      expect(rows.listings).toMatchObject({ status: "ACTIVE", activeCycle: 1, version: 1, deletedAt: null });
      expect(rows.auth_sessions.tokenVersion).toBe(1);
      expect(rows.otp_challenges.attempts).toBe(0);
      expect(rows.transaction_proposals).toMatchObject({ status: "PENDING", acceptedCycle: null, resolvedAt: null });
      expect(rows.notifications).toMatchObject({ isRead: false, readAt: null, deletedAt: null });
      expect(rows.outbox_events).toMatchObject({ status: "PENDING", attempts: 0, payload: { listingId: rows.listings.id } });
      for (const row of Object.values(rows)) {
        if ("createdAt" in row) expect(row.createdAt).toBeInstanceOf(Date);
      }
    });
  });
});
