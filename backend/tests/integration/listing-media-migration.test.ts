import { describe, expect, it } from "vitest";
import { createFixtures } from "../helpers/database-fixtures";
import {
  authUserMigration,
  createMigrationSchema,
  migrationSql,
} from "../helpers/migration-fixtures";
import { withTestTransaction } from "../helpers/test-database";

describe("Listing Media migration compatibility", () => {
  it("preserves existing rows, every other CHECK, FK and index", async () => {
    await withTestTransaction(async (client) => {
      await createMigrationSchema(client);
      await client.query(migrationSql(authUserMigration));
      await createFixtures(client);
      const rowsBefore = await client.query("SELECT * FROM media_assets ORDER BY id");
      const constraintsSql =
        "SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'media_assets'::regclass AND conname <> 'ck_media_purpose' ORDER BY conname";
      const indexesSql =
        "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'media_assets' ORDER BY indexname";
      const constraintsBefore = await client.query(constraintsSql);
      const indexesBefore = await client.query(indexesSql);
      await client.query(migrationSql("0005_listing_media_preparation"));
      expect((await client.query("SELECT * FROM media_assets ORDER BY id")).rows).toEqual(
        rowsBefore.rows,
      );
      expect((await client.query(constraintsSql)).rows).toEqual(constraintsBefore.rows);
      expect((await client.query(indexesSql)).rows).toEqual(indexesBefore.rows);
    });
  });
  it("refuses incompatible legacy data without deleting or rewriting it", async () => {
    await withTestTransaction(async (client) => {
      await createMigrationSchema(client);
      await client.query(migrationSql(authUserMigration));
      const fixtures = await createFixtures(client);
      await client.query("ALTER TABLE media_assets DROP CONSTRAINT ck_media_purpose");
      await client.query("ALTER TABLE media_assets ADD CONSTRAINT ck_media_purpose CHECK (true)");
      await client.query("UPDATE media_assets SET purpose = 'PROFILE' WHERE id = $1", [
        fixtures.media_assets.id,
      ]);
      const before = await client.query("SELECT * FROM media_assets ORDER BY id");
      await client.query("SAVEPOINT attempt");
      await expect(
        client.query(migrationSql("0005_listing_media_preparation")),
      ).rejects.toMatchObject({ code: "P0001" });
      await client.query("ROLLBACK TO SAVEPOINT attempt");
      expect((await client.query("SELECT * FROM media_assets ORDER BY id")).rows).toEqual(
        before.rows,
      );
    });
  });
});
