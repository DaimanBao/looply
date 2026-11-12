import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { withTestTransaction as withRollback } from "../helpers/test-database";

/** Creates a distinct identity for each rollback-isolated user case. */
function testUser(username: string) {
  return {
    id: randomUUID(),
    username,
    displayName: "Integration Test User",
  };
}

describe("User database constraints", () => {
  it("accepts a valid username", async () => {
    await withRollback(async (client) => {
      const user = testUser(`test_${randomUUID().replace(/-/g, "").slice(0, 12)}`);

      const result = await client.query(
        `INSERT INTO users ("id", "username", "displayName", "updatedAt")
         VALUES ($1, $2, $3, NOW())
         RETURNING username`,
        [user.id, user.username, user.displayName],
      );

      expect(result.rows[0].username).toBe(user.username);
    });
  });

  it.each([
    ["uppercase", "InvalidUser"],
    ["spaces", "invalid user"],
    ["special characters", "invalid@user"],
    ["too short", "ab"],
  ])("rejects %s in username", async (_case, username) => {
    await withRollback(async (client) => {
      const user = testUser(username);

      await expect(
        client.query(
          `INSERT INTO users ("id", "username", "displayName", "updatedAt")
           VALUES ($1, $2, $3, NOW())`,
          [user.id, user.username, user.displayName],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "ck_user_username",
      });
    });
  });
  it("rejects a username longer than 30 characters", async () => {
    await withRollback(async (client) => {
      const user = testUser("a".repeat(31));

      await expect(
        client.query(
          `INSERT INTO users
            ("id", "username", "displayName", "updatedAt")
            VALUES ($1, $2, $3, NOW())`,
          [user.id, user.username, user.displayName],
        ),
      ).rejects.toMatchObject({
        code: "22001",
      });
    });
  });

  it("accepts an email without verification", async () => {
    await withRollback(async (client) => {
      const user = testUser(`test_${randomUUID().slice(0, 8)}`);

      const result = await client.query(
        `INSERT INTO users ("id", "username", "displayName", "email", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW()) RETURNING email, "emailVerifiedAt"`,
        [user.id, user.username, user.displayName, "test@example.com"],
      );
      expect(result.rows[0]).toMatchObject({ email: "test@example.com", emailVerifiedAt: null });
    });
  });

  it("accepts a verified email", async () => {
    await withRollback(async (client) => {
      const user = testUser(`test_${randomUUID().slice(0, 8)}`);

      const result = await client.query(
        `INSERT INTO users
         ("id", "username", "displayName", "email", "emailVerifiedAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING email`,
        [user.id, user.username, user.displayName, "test@example.com"],
      );

      expect(result.rows[0].email).toBe("test@example.com");
    });
  });

  it("rejects a phone without verification", async () => {
    await withRollback(async (client) => {
      const user = testUser(`test_${randomUUID().slice(0, 8)}`);

      await expect(
        client.query(
          `INSERT INTO users ("id", "username", "displayName", "phone", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW())`,
          [user.id, user.username, user.displayName, "0901234567"],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "ck_user_verified_phone",
      });
    });
  });

  it("accepts a verified phone", async () => {
    await withRollback(async (client) => {
      const user = testUser(`test_${randomUUID().slice(0, 8)}`);

      const result = await client.query(
        `INSERT INTO users
         ("id", "username", "displayName", "phone", "phoneVerifiedAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING phone`,
        [user.id, user.username, user.displayName, "0901234567"],
      );

      expect(result.rows[0].phone).toBe("0901234567");
    });
  });
});
