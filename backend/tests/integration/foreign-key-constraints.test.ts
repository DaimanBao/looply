import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { foreignKeys } from "../helpers/constraint-catalog";
import { createFixtures, insertRow, updateRow, type SqlValue } from "../helpers/database-fixtures";
import { withTestTransaction } from "../helpers/test-database";

describe("Database foreign keys", () => {
  // Tham chiếu mồ côi thật phải lỗi dù mọi FK không liên quan đều hợp lệ.
  it.each(foreignKeys)("rejects orphan %s.%s -> %s", async (table, column) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const missingId = randomUUID();
      const changes: Record<string, SqlValue> = { [column]: missingId };
      let constraint = `${table}_${column}_fkey`;
      if (table === "media_assets" && column === "chatConversationId")
        Object.assign(changes, { purpose: "CHAT", listingId: null });
      if (table === "listing_card_snapshots" && column === "messageId")
        Object.assign(changes, {
          imageState: "AVAILABLE",
          snapshotCreatedAt: new Date(),
          imageSizeBytes: 1,
          sourceMediaId: null,
          sourceListingVersion: null,
        });
      if (table === "messages" && column === "proposalId") {
        Object.assign(changes, { type: "TRANSACTION_CARD", content: null });
      }
      if (table === "conversations" && (column === "initiatorId" || column === "contactUserId")) {
        // CHECK LISTING ràng buộc các cột này; phải đổi cả hai trước khi kiểm tra FK.
        Object.assign(changes, { initiatorId: missingId, contactUserId: missingId });
        constraint = "conversations_initiatorId_fkey";
      }
      if (table === "conversations" && column.startsWith("directUser")) {
        const contactId = rows.conversations.initiatorId;
        if (typeof contactId !== "string") throw new Error("Missing fixture contact");
        const missing =
          column === "directUserLowId"
            ? "00000000-0000-0000-0000-000000000000"
            : "ffffffff-ffff-ffff-ffff-ffffffffffff";
        Object.assign(changes, {
          type: "DIRECT",
          listingId: null,
          contactUserId: null,
          directUserLowId: column === "directUserLowId" ? missing : contactId,
          directUserHighId: column === "directUserHighId" ? missing : contactId,
        });
      }
      await expect(updateRow(client, table, rows[table].id, changes)).rejects.toMatchObject({
        code: "23503",
        constraint,
      });
    });
  });

  // Kiểm tra action và hai đầu của mọi FK, kể cả các FK Conversation liên kết.
  it("matches all migration FKs with RESTRICT deletes and CASCADE updates", async () => {
    await withTestTransaction(async (client) => {
      const result = await client.query<{
        table_name: string;
        column_name: string;
        referenced_table: string;
        delete_action: string;
        update_action: string;
      }>(
        `SELECT t.relname AS table_name, a.attname AS column_name, r.relname AS referenced_table,
                c.confdeltype AS delete_action, c.confupdtype AS update_action
         FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN pg_class r ON r.oid = c.confrelid
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
         WHERE c.contype = 'f' AND n.nspname = 'public'`,
      );
      expect(result.rows).toHaveLength(foreignKeys.length);
      for (const [table, column, parent] of foreignKeys) {
        expect(result.rows).toContainEqual({
          table_name: table,
          column_name: column,
          referenced_table: parent,
          delete_action: "r",
          update_action: "c",
        });
      }
    });
  });

  // FK phải bảo vệ lịch sử thay vì ngầm xóa hàng phụ thuộc.
  it.each([
    "provinces",
    "users",
    "listings",
    "media_assets",
    "conversations",
    "messages",
    "transaction_proposals",
    "outbox_events",
  ] as const)("restricts deletion of referenced %s", async (table) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      if (table === "media_assets") {
        await updateRow(client, "media_assets", rows.media_assets.id, {
          purpose: "PROFILE",
          listingId: null,
        });
        await updateRow(client, "users", rows.users.id, { avatarMediaId: rows.media_assets.id });
      }
      await expect(
        client.query(`DELETE FROM "${table}" WHERE id = $1`, [rows[table].id]),
      ).rejects.toMatchObject({ code: "23503" });
    });
  });

  // Kiểm tra ON UPDATE CASCADE trên cha dùng chung và xác nhận cả hai tham chiếu đổi theo.
  it("cascades a province identifier change to user and listing", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const nextId = randomUUID();
      await updateRow(client, "provinces", rows.provinces.id, { id: nextId });
      const result = await client.query<{ provinceId: string }>(
        'SELECT "provinceId" FROM users WHERE id = $1 UNION ALL SELECT "provinceId" FROM listings WHERE id = $2',
        [rows.users.id, rows.listings.id],
      );
      expect(result.rows).toEqual([{ provinceId: nextId }, { provinceId: nextId }]);
    });
  });

  // NULL là tham chiếu tùy chọn vắng mặt, không phải khóa mồ côi.
  it("accepts null optional references and unattached users", async () => {
    await withTestTransaction(async (client) => {
      const row = await insertRow(client, "users", {
        id: randomUUID(),
        username: `test_${randomUUID().slice(0, 8)}`,
        displayName: "Optional references",
        updatedAt: new Date(),
      });
      expect(row.avatarMediaId).toBeNull();
      expect(row.provinceId).toBeNull();
    });
  });
});
