import { describe, expect, it } from "vitest";
import { createLegacyFixtures, updateRow } from "../helpers/database-fixtures";
import {
  createMigrationSchema,
  migrationSql,
  authUserMigration,
} from "../helpers/migration-fixtures";
import { withTestTransaction } from "../helpers/test-database";

describe("Chat additive migration", () => {
  it("preserves existing history and backfills actual activity without inventing historical snapshots", async () => {
    await withTestTransaction(async (client) => {
      await createMigrationSchema(client);
      await client.query(migrationSql(authUserMigration));
      await client.query(migrationSql("0005_listing_media_preparation"));
      const rows = await createLegacyFixtures(client);
      const resolvedAt = new Date("2028-01-01T12:00:00Z");
      await updateRow(client, "transaction_proposals", rows.transaction_proposals.id, {
        status: "ACCEPTED",
        acceptedCycle: 1,
        resolvedAt,
      });
      const before = await client.query("SELECT * FROM messages WHERE id=$1", [rows.messages.id]);
      await client.query(migrationSql("0006_chat_module"));
      await client.query(migrationSql("0007_chat_reservation_version"));
      expect(
        (await client.query("SELECT * FROM messages WHERE id=$1", [rows.messages.id])).rows,
      ).toEqual(before.rows);
      expect(
        (
          await client.query('SELECT "lastActivityAt" FROM conversations WHERE id=$1', [
            rows.conversations.id,
          ])
        ).rows[0].lastActivityAt,
      ).toEqual(resolvedAt);
      expect(
        (await client.query("SELECT count(*)::int AS count FROM listing_card_snapshots")).rows[0]
          .count,
      ).toBe(0);
    });
  });
});
