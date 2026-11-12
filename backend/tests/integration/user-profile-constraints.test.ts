import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { constraintCases } from "../helpers/constraint-cases";
import { createFixtures, insertRow, updateRow } from "../helpers/database-fixtures";
import { withTestTransaction } from "../helpers/test-database";

const requestedAt = new Date("2026-11-01T00:00:00.000Z");

constraintCases("users", [
  { name: "accepts an underscore-only username", changes: { username: "___" } },
  { name: "accepts an unchanged username timestamp", changes: { usernameChangedAt: null } },
  { name: "accepts a username change timestamp", changes: { usernameChangedAt: requestedAt } },
  { name: "accepts a one-character Unicode display name", changes: { displayName: "Đ" } },
  { name: "accepts a Vietnamese display name", changes: { displayName: "Nguyễn Hoàng Bảo" } },
  { name: "accepts a 60-character Unicode display name", changes: { displayName: "Đ".repeat(60) } },
  { name: "accepts 60 supplementary Unicode characters", changes: { displayName: "😀".repeat(60) } },
  { name: "rejects an empty display name", changes: { displayName: "" }, constraint: "ck_user_display_name" },
  { name: "rejects a 61-character display name", changes: { displayName: "Đ".repeat(61) }, code: "22001" },
  { name: "accepts ACTIVE without a deletion request", changes: { status: "ACTIVE", deletionRequestedAt: null } },
  { name: "rejects ACTIVE with a deletion request", changes: { status: "ACTIVE", deletionRequestedAt: requestedAt }, constraint: "ck_user_deletion_state" },
  { name: "accepts PENDING_DELETION with a request", changes: { status: "PENDING_DELETION", deletionRequestedAt: requestedAt } },
  { name: "rejects PENDING_DELETION without a request", changes: { status: "PENDING_DELETION", deletionRequestedAt: null }, constraint: "ck_user_deletion_state" },
  { name: "accepts DELETING with a request", changes: { status: "DELETING", deletionRequestedAt: requestedAt } },
  { name: "rejects DELETING without a request", changes: { status: "DELETING", deletionRequestedAt: null }, constraint: "ck_user_deletion_state" },
  { name: "accepts DELETED retaining its request", changes: { status: "DELETED", deletionRequestedAt: requestedAt } },
  { name: "accepts DELETED after clearing its request", changes: { status: "DELETED", deletionRequestedAt: null } },
  { name: "rejects an unapproved account status", changes: { status: "SUSPENDED" }, code: "22P02" },
]);

describe("Account lifecycle persistence", () => {
  it.each(["ACTIVE", "PENDING_DELETION", "DELETING", "DELETED"])("preserves contact and username uniqueness in %s until explicit cleanup", async (status) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await updateRow(client, "users", rows.users.id, { status, deletionRequestedAt: status === "ACTIVE" ? null : requestedAt });
      for (const field of ["username", "email", "phone"] as const) {
        await client.query("SAVEPOINT duplicate_identity");
        await expect(insertRow(client, "users", {
          id: randomUUID(), username: field === "username" ? rows.users.username ?? null : `test_${randomUUID().slice(0, 8)}`,
          displayName: "Conflicting identity", updatedAt: new Date(),
          email: field === "email" ? rows.users.email ?? null : null,
          emailVerifiedAt: field === "email" ? requestedAt : null,
          phone: field === "phone" ? rows.users.phone ?? null : null,
          phoneVerifiedAt: field === "phone" ? requestedAt : null,
        })).rejects.toMatchObject({ code: "23505", constraint: field === "email" ? "uq_user_verified_email" : `users_${field}_key` });
        await client.query("ROLLBACK TO SAVEPOINT duplicate_identity");
      }
    });
  });

  it("supports cancellation and completion without changing the User ID or chat references", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await updateRow(client, "users", rows.users.id, { status: "PENDING_DELETION", deletionRequestedAt: requestedAt });
      await updateRow(client, "users", rows.users.id, { status: "ACTIVE", deletionRequestedAt: null });
      await updateRow(client, "users", rows.users.id, { status: "PENDING_DELETION", deletionRequestedAt: requestedAt });
      await updateRow(client, "users", rows.users.id, { status: "DELETING" });
      const deleted = await updateRow(client, "users", rows.users.id, { status: "DELETED", deletionRequestedAt: null });
      expect(deleted.id).toBe(rows.users.id);
      const listing = await client.query<{ ownerId: string }>('SELECT "ownerId" FROM listings WHERE id = $1', [rows.listings.id]);
      expect(listing.rows[0]?.ownerId).toBe(rows.users.id);
      const messages = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM messages WHERE "conversationId" = $1', [rows.conversations.id]);
      expect(messages.rows[0]?.count).toBe(1);
    });
  });
});
