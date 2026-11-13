import { describe, expect, it } from "vitest";
import { constraintCases } from "../helpers/constraint-cases";
import { createFixtures, updateRow } from "../helpers/database-fixtures";
import { withTestTransaction } from "../helpers/test-database";

constraintCases("conversations", [
  {
    name: "rejects LISTING without listing",
    changes: { listingId: null },
    constraint: "ck_conversation_shape",
  },
  {
    name: "rejects LISTING without contact",
    changes: { contactUserId: null },
    constraint: "ck_conversation_shape",
  },
  {
    name: "rejects DIRECT with LISTING fields",
    changes: { type: "DIRECT" },
    constraint: "ck_conversation_shape",
  },
  { name: "rejects unsupported group conversation", changes: { type: "GROUP" }, code: "22P02" },
]);

describe("Conversation participant shape", () => {
  // Thứ tự chuẩn và tư cách thành viên người khởi tạo là CHECK; tư cách thành viên thực cần service.
  it.each([
    "valid low initiator",
    "valid high initiator",
    "reversed",
    "self",
    "outsider",
    "missing low",
    "missing high",
    "mixed fields",
  ])("DIRECT: %s", async (shape) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const contact = rows.conversations.initiatorId;
      if (typeof contact !== "string") throw new Error("Missing contact");
      const [low, high] = [rows.users.id, contact].sort();
      if (!low || !high) throw new Error("Missing pair");
      const changes = {
        type: "DIRECT",
        listingId: shape === "mixed fields" ? rows.listings.id : null,
        contactUserId: null,
        directUserLowId: shape === "missing low" ? null : shape === "reversed" ? high : low,
        directUserHighId:
          shape === "missing high" ? null : shape === "reversed" || shape === "self" ? low : high,
        initiatorId:
          shape === "outsider"
            ? "00000000-0000-0000-0000-000000000000"
            : shape === "valid high initiator"
              ? high
              : low,
      };
      const write = updateRow(client, "conversations", rows.conversations.id, changes);
      if (shape.startsWith("valid")) expect((await write).type).toBe("DIRECT");
      else
        await expect(write).rejects.toMatchObject({
          code: "23514",
          constraint: "ck_conversation_shape",
        });
    });
  });

  // Database phải tự từ chối tự theo dõi và tự chặn.
  it.each([
    {
      table: "user_follows",
      from: "followerId",
      to: "followingId",
      constraint: "ck_user_follow_self",
    },
    { table: "user_blocks", from: "blockerId", to: "blockedId", constraint: "ck_user_block_self" },
  ] as const)("rejects self relation in $table", async ({ table, from, to, constraint }) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await expect(
        updateRow(client, table, rows[table].id, { [to]: rows[table][from] ?? null }),
      ).rejects.toMatchObject({ code: "23514", constraint });
    });
  });
});
