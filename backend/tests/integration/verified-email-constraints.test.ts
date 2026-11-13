import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFixtures, insertRow, updateRow } from "../helpers/database-fixtures";
import { withTestTransaction } from "../helpers/test-database";

describe("Verified email ownership", () => {
  it("allows duplicate unverified declarations alongside a verified owner", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      for (let index = 0; index < 2; index++) {
        const user = await insertRow(client, "users", {
          id: randomUUID(),
          username: `test_${randomUUID().slice(0, 8)}`,
          displayName: "Email declaration",
          email: rows.users.email ?? null,
          updatedAt: new Date(),
        });
        expect(user.emailVerifiedAt).toBeNull();
      }
      const owner = await client.query<{ email: string; emailVerifiedAt: Date }>(
        'SELECT email, "emailVerifiedAt" FROM users WHERE id = $1',
        [rows.users.id],
      );
      expect(owner.rows[0]).toMatchObject({
        email: rows.users.email,
        emailVerifiedAt: rows.users.emailVerifiedAt,
      });
    });
  });

  it("allows verification despite another unverified declaration", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await updateRow(client, "users", rows.users.id, { emailVerifiedAt: null });
      const otherId = rows.conversations.initiatorId;
      if (typeof otherId !== "string") throw new Error("Missing fixture contact");
      const owner = await updateRow(client, "users", otherId, {
        email: rows.users.email ?? null,
        emailVerifiedAt: new Date(),
      });
      expect(owner.email).toBe(rows.users.email);
      // Vô hiệu hóa khai báo nguyên tử thuộc service xác minh trong tương lai.
    });
  });

  it.each([
    ["identical", "owner@example.com"],
    ["case variant", "OWNER@EXAMPLE.COM"],
    ["space padding", "  Owner@Example.com  "],
    ["ASCII trim whitespace", "\t\n\r\f\vOwner@Example.com\v\f\r\n\t"],
    [
      "Unicode trim whitespace",
      "\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeffOwner@Example.com\ufeff",
    ],
  ])("rejects %s ownership at INSERT", async (_name, email) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await updateRow(client, "users", rows.users.id, { email: "owner@example.com" });
      await expect(
        insertRow(client, "users", {
          id: randomUUID(),
          username: `test_${randomUUID().slice(0, 8)}`,
          displayName: "Conflicting owner",
          email,
          emailVerifiedAt: new Date(),
          updatedAt: new Date(),
        }),
      ).rejects.toMatchObject({ code: "23505", constraint: "uq_user_verified_email" });
    });
  });

  it("rejects competing verification at UPDATE", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const declaration = await insertRow(client, "users", {
        id: randomUUID(),
        username: `test_${randomUUID().slice(0, 8)}`,
        displayName: "Pending owner",
        email: rows.users.email ?? null,
        updatedAt: new Date(),
      });
      await expect(
        updateRow(client, "users", declaration.id, { emailVerifiedAt: new Date() }),
      ).rejects.toMatchObject({ code: "23505", constraint: "uq_user_verified_email" });
    });
  });

  it.each([
    ["ownername@example.com", "owner.name@example.com"],
    ["owner@example.com", "owner+suffix@example.com"],
  ])("keeps %s distinct from %s", async (original, email) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await updateRow(client, "users", rows.users.id, { email: original });
      const other = await insertRow(client, "users", {
        id: randomUUID(),
        username: `test_${randomUUID().slice(0, 8)}`,
        displayName: "Distinct owner",
        email,
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      });
      expect(other.email).toBe(email);
    });
  });

  it("releases ownership only when the verified contact is cleared", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const email = rows.users.email ?? null;
      await updateRow(client, "users", rows.users.id, { email: null, emailVerifiedAt: null });
      const owner = await insertRow(client, "users", {
        id: randomUUID(),
        username: `test_${randomUUID().slice(0, 8)}`,
        displayName: "New owner",
        email,
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      });
      expect(owner.id).not.toBe(rows.users.id);
    });
  });

  it("uses a valid partial unique expression index without a global email index", async () => {
    await withTestTransaction(async (client) => {
      const result = await client.query<{
        index_name: string;
        indisunique: boolean;
        indisvalid: boolean;
        predicate: string | null;
      }>(
        `SELECT c.relname AS index_name, i.indisunique, i.indisvalid, pg_get_expr(i.indpred, i.indrelid) AS predicate
         FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE i.indrelid = 'users'::regclass`,
      );
      expect(result.rows.find((row) => row.index_name === "uq_user_verified_email")).toMatchObject({
        indisunique: true,
        indisvalid: true,
        predicate: '("emailVerifiedAt" IS NOT NULL)',
      });
      expect(result.rows.some((row) => row.index_name === "users_email_key")).toBe(false);
    });
  });
});
