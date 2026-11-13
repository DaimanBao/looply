import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { insertRow, type TestRow } from "../helpers/database-fixtures";
import {
  authUserMigration,
  createMigrationSchema,
  migrationSql,
  previousMigrations,
} from "../helpers/migration-fixtures";
import { withTestTransaction } from "../helpers/test-database";

describe("Auth/User migration compatibility", () => {
  it("preserves an existing User and verified contact while assigning safe defaults", async () => {
    await withTestTransaction(async (client) => {
      await createMigrationSchema(client);
      const original = await insertRow(client, "users", {
        id: randomUUID(),
        username: "existing_user",
        displayName: "Nguyễn Hoàng Bảo",
        passwordHash: "migration-test-hash",
        email: " Existing.Owner+suffix@Example.com ",
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      });
      const before = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema = current_schema() AND is_nullable = 'NO'",
      );
      expect(before.rows[0]?.count).toBe(106);
      await client.query(migrationSql(authUserMigration));
      const after = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema = current_schema() AND is_nullable = 'NO'",
      );
      expect(after.rows[0]?.count).toBe(107);
      const result = await client.query<TestRow>("SELECT * FROM users WHERE id = $1", [
        original.id,
      ]);
      expect(result.rows[0]).toMatchObject({
        ...original,
        status: "ACTIVE",
        deletionRequestedAt: null,
        usernameChangedAt: null,
      });
      await expect(
        insertRow(client, "users", {
          id: randomUUID(),
          username: "competing_owner",
          displayName: "Other owner",
          email: "existing.owner+suffix@example.com",
          emailVerifiedAt: new Date(),
          updatedAt: new Date(),
        }),
      ).rejects.toMatchObject({ code: "23505", constraint: "uq_user_verified_email" });
    });
  });

  it("stops on normalized verified email conflicts without altering existing rows or constraints", async () => {
    await withTestTransaction(async (client) => {
      await createMigrationSchema(client);
      for (const [username, email] of [
        ["first_owner", "owner@example.com"],
        ["second_owner", " OWNER@Example.com "],
      ] as const) {
        await insertRow(client, "users", {
          id: randomUUID(),
          username,
          displayName: "Existing owner",
          email,
          emailVerifiedAt: new Date(),
          updatedAt: new Date(),
        });
      }
      await client.query("SAVEPOINT migration_attempt");
      await expect(client.query(migrationSql(authUserMigration))).rejects.toMatchObject({
        code: "P0001",
      });
      await client.query("ROLLBACK TO SAVEPOINT migration_attempt");
      const result = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM users",
      );
      expect(result.rows[0]?.count).toBe(2);
      const index = await client.query<{ name: string | null }>(
        "SELECT to_regclass(current_schema() || '.users_email_key')::text AS name",
      );
      expect(index.rows[0]?.name).not.toBeNull();
      const status = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'status'",
      );
      expect(status.rows[0]?.count).toBe(0);
    });
  });

  it("stops on an existing empty display name instead of rewriting it", async () => {
    await withTestTransaction(async (client) => {
      await createMigrationSchema(client);
      const user = await insertRow(client, "users", {
        id: randomUUID(),
        username: "empty_display",
        displayName: "",
        updatedAt: new Date(),
      });
      await client.query("SAVEPOINT migration_attempt");
      await expect(client.query(migrationSql(authUserMigration))).rejects.toMatchObject({
        code: "P0001",
      });
      await client.query("ROLLBACK TO SAVEPOINT migration_attempt");
      const result = await client.query<{ displayName: string }>(
        'SELECT "displayName" FROM users WHERE id = $1',
        [user.id],
      );
      expect(result.rows[0]?.displayName).toBe("");
    });
  });

  it("retains all completed migration records and their content checksums", async () => {
    await withTestTransaction(async (client) => {
      const result = await client.query<{
        migration_name: string;
        checksum: string;
        finished_at: Date | null;
        rolled_back_at: Date | null;
      }>(
        "SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name",
      );
      expect(result.rows.map((row) => row.migration_name)).toEqual([
        ...previousMigrations,
        authUserMigration,
        "0005_listing_media_preparation",
      ]);
      for (const row of result.rows) {
        const body = readFileSync(
          resolve(__dirname, "../../prisma/migrations", row.migration_name, "migration.sql"),
          "utf8",
        );
        const variants = [
          body,
          body.replace(/\r\n/g, "\n"),
          body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"),
        ];
        expect(variants.map((value) => createHash("sha256").update(value).digest("hex"))).toContain(
          row.checksum,
        );
        expect(row.finished_at).toBeInstanceOf(Date);
        expect(row.rolled_back_at).toBeNull();
      }
    });
  });
});
