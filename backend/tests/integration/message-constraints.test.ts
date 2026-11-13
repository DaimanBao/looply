import { describe, expect, it } from "vitest";
import { constraintCases } from "../helpers/constraint-cases";
import { createFixtures, updateRow, type SqlValue } from "../helpers/database-fixtures";
import { withTestTransaction } from "../helpers/test-database";

constraintCases("messages", [
  { name: "accepts one character", changes: { content: "a" } },
  { name: "accepts 5000 characters", changes: { content: "a".repeat(5000) } },
  { name: "accepts emoji", changes: { content: "Xin chào 👋" } },
  {
    name: "rejects 5001 characters",
    changes: { content: "a".repeat(5001) },
    constraint: "ck_message_shape",
  },
  { name: "rejects empty text", changes: { content: "" }, constraint: "ck_message_shape" },
  { name: "rejects space-only text", changes: { content: "   " }, constraint: "ck_message_shape" },
  {
    name: "rejects missing text and image",
    changes: { content: null },
    constraint: "ck_message_shape",
  },
  {
    name: "rejects card without proposal",
    changes: { type: "TRANSACTION_CARD", content: null },
    constraint: "ck_message_shape",
  },
  {
    name: "rejects hash over column limit",
    changes: { payloadHash: "h".repeat(129) },
    code: "22001",
  },
  { name: "accepts hash at column limit", changes: { payloadHash: "h".repeat(128) } },
  { name: "rejects unsupported message type", changes: { type: "VIDEO" }, code: "22P02" },
]);

describe("Message attachment shapes", () => {
  // Đồ thị mới cung cấp media và tham chiếu đề xuất thật cho từng dạng.
  it.each([
    { name: "image only", content: null, card: false },
    { name: "text with image", content: "Photo", card: false },
    { name: "proposal card", content: null, card: true },
  ])("accepts $name", async ({ content, card }) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await updateRow(client, "media_assets", rows.media_assets.id, {
        purpose: "CHAT",
        listingId: null,
      });
      const message = await updateRow(client, "messages", rows.messages.id, {
        type: card ? "TRANSACTION_CARD" : "TEXT",
        content,
        imageMediaId: card ? null : rows.media_assets.id,
        proposalId: card ? rows.transaction_proposals.id : null,
      });
      expect(message.content).toBe(content);
    });
  });

  // Tổ hợp nội dung/đính kèm phải lỗi CHECK message, không phải thiếu FK.
  it.each(["text with proposal", "card with text", "card with image", "blank text with image"])(
    "rejects %s",
    async (shape) => {
      await withTestTransaction(async (client) => {
        const rows = await createFixtures(client);
        const changes: Record<string, SqlValue> =
          shape === "text with proposal"
            ? { proposalId: rows.transaction_proposals.id }
            : shape === "blank text with image"
              ? { content: " ", imageMediaId: rows.media_assets.id }
              : {
                  type: "TRANSACTION_CARD",
                  proposalId: rows.transaction_proposals.id,
                  content: shape === "card with text" ? "text" : null,
                  imageMediaId: shape === "card with image" ? rows.media_assets.id : null,
                };
        await expect(
          updateRow(client, "messages", rows.messages.id, changes),
        ).rejects.toMatchObject({ code: "23514", constraint: "ck_message_shape" });
      });
    },
  );
});
