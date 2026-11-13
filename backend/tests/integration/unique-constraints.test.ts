import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { uniqueKeys } from "../helpers/constraint-catalog";
import {
  createFixtures,
  insertRow,
  updateRow,
  type FixtureRows,
  type Table,
  type TestRow,
} from "../helpers/database-fixtures";
import { withTestTransaction } from "../helpers/test-database";
import type { Client } from "pg";

/** Cung cấp khóa khác NULL và tách giá trị unique không liên quan trước khi tạo khóa trùng. */
async function prepareUniqueRows(
  client: Client,
  rows: FixtureRows,
  table: Table,
  columns: readonly string[],
): Promise<TestRow> {
  let original = rows[table];
  if (table === "users" && columns.includes("avatarMediaId")) {
    await updateRow(client, "media_assets", rows.media_assets.id, {
      purpose: "PROFILE",
      listingId: null,
    });
    original = await updateRow(client, table, original.id, { avatarMediaId: rows.media_assets.id });
  }
  if (table === "messages" && columns.includes("proposalId")) {
    original = await updateRow(client, table, original.id, {
      type: "TRANSACTION_CARD",
      content: null,
      proposalId: rows.transaction_proposals.id,
    });
  }
  if (table === "messages" && columns.includes("imageMediaId")) {
    await updateRow(client, "media_assets", rows.media_assets.id, {
      purpose: "CHAT",
      listingId: null,
    });
    original = await updateRow(client, table, original.id, { imageMediaId: rows.media_assets.id });
  }
  if (table === "conversations" && columns.includes("directUserLowId")) {
    const contactId = rows.conversations.initiatorId;
    if (typeof contactId !== "string") throw new Error("Missing contact");
    const [low, high] = [rows.users.id, contactId].sort();
    if (!low || !high) throw new Error("Missing direct participants");
    original = await updateRow(client, table, original.id, {
      type: "DIRECT",
      listingId: null,
      contactUserId: null,
      directUserLowId: low,
      directUserHighId: high,
    });
  }
  const duplicate: TestRow = { ...original, id: randomUUID() };
  if (table === "users") {
    if (!columns.includes("username"))
      duplicate.username = `test_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    if (!columns.includes("email")) {
      duplicate.email = null;
      duplicate.emailVerifiedAt = null;
    }
    if (!columns.includes("phone")) {
      duplicate.phone = null;
      duplicate.phoneVerifiedAt = null;
    }
    if (!columns.includes("avatarMediaId")) duplicate.avatarMediaId = null;
  }
  if (table === "google_accounts") {
    if (!columns.includes("googleSubject")) duplicate.googleSubject = `test-${randomUUID()}`;
    if (!columns.includes("userId")) duplicate.userId = rows.conversations.initiatorId ?? null;
  }
  if (table === "messages" && !columns.includes("requestId")) duplicate.requestId = randomUUID();
  return duplicate;
}

describe("Database unique constraints", () => {
  // Kiểm tra mọi unique index thường bằng giá trị trùng thật, hợp lệ.
  it.each(uniqueKeys)("rejects duplicate %s (%s)", async (table, columns) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const duplicate = await prepareUniqueRows(client, rows, table, columns);
      await expect(insertRow(client, table, duplicate)).rejects.toMatchObject({
        code: "23505",
        constraint: `${table}_${columns.join("_")}_key`,
      });
    });
  });

  // Primary key mọi model phải từ chối định danh fixture đã tồn tại.
  it.each([
    "provinces",
    "users",
    "auth_sessions",
    "otp_challenges",
    "google_accounts",
    "user_follows",
    "user_blocks",
    "listings",
    "listing_follows",
    "media_assets",
    "conversations",
    "conversation_participants",
    "messages",
    "transaction_proposals",
    "notifications",
    "outbox_events",
    "processed_events",
  ] as const)("rejects duplicate primary key in %s", async (table) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await expect(insertRow(client, table, rows[table])).rejects.toMatchObject({
        code: "23505",
        constraint: `${table}_pkey`,
      });
    });
  });

  // Trường unique nullable cho phép nhiều giá trị vắng mặt.
  it("allows multiple users without avatar, email or phone", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const contactId = rows.conversations.initiatorId;
      const created = await insertRow(client, "users", {
        id: randomUUID(),
        username: `test_${randomUUID().slice(0, 8)}`,
        displayName: "Second contact",
        updatedAt: new Date(),
      });
      expect(created.id).not.toBe(contactId);
      expect(created.email).toBeNull();
      expect(created.phone).toBeNull();
      expect(created.avatarMediaId).toBeNull();
    });
  });

  // Khóa idempotency ghép có phạm vi cả conversation và người gửi.
  it.each(["sender", "conversation"])(
    "allows same requestId with a different %s",
    async (scope) => {
      await withTestTransaction(async (client) => {
        const rows = await createFixtures(client);
        let conversationId = rows.conversations.id;
        if (scope === "conversation") {
          const direct = await prepareUniqueRows(client, rows, "conversations", [
            "directUserLowId",
            "directUserHighId",
          ]);
          await updateRow(client, "conversations", rows.conversations.id, {
            type: "LISTING",
            listingId: rows.listings.id,
            contactUserId: rows.conversations.contactUserId ?? null,
            directUserLowId: null,
            directUserHighId: null,
          });
          conversationId = (await insertRow(client, "conversations", direct)).id;
        }
        const row = await insertRow(client, "messages", {
          ...rows.messages,
          id: randomUUID(),
          conversationId,
          senderId: scope === "sender" ? rows.users.id : (rows.messages.senderId ?? null),
        });
        expect(row.requestId).toBe(rows.messages.requestId);
      });
    },
  );
});
