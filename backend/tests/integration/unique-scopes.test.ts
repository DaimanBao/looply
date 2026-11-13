import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFixtures, insertRow, updateRow } from "../helpers/database-fixtures";
import { withTestTransaction } from "../helpers/test-database";

describe("Independent unique key scopes", () => {
  // Follow và block có hướng; cặp đảo ngược là quan hệ khác.
  it.each([
    { table: "user_follows", from: "followerId", to: "followingId" },
    { table: "user_blocks", from: "blockerId", to: "blockedId" },
  ] as const)("allows reverse pair in $table", async ({ table, from, to }) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const first = rows[table];
      const reverse = await insertRow(client, table, {
        ...first,
        id: randomUUID(),
        [from]: first[to] ?? null,
        [to]: first[from] ?? null,
      });
      expect(reverse[from]).toBe(first[to]);
    });
  });

  // Một consumer xử lý được nhiều sự kiện; các consumer khác nhau có thể xử lý cùng sự kiện.
  it("allows the same event for another consumer", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const receipt = await insertRow(client, "processed_events", {
        ...rows.processed_events,
        id: randomUUID(),
        consumerName: "other-test-consumer",
      });
      expect(receipt.eventId).toBe(rows.outbox_events.id);
    });
  });

  // Một listing có nhiều liên hệ và mỗi conversation có slot đang chờ riêng.
  it("allows different contacts and pending proposals on the same listing", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const user = await insertRow(client, "users", {
        id: randomUUID(),
        username: `test_${randomUUID().slice(0, 8)}`,
        displayName: "Another contact",
        updatedAt: new Date(),
      });
      const conversation = await insertRow(client, "conversations", {
        ...rows.conversations,
        id: randomUUID(),
        initiatorId: user.id,
        contactUserId: user.id,
      });
      const proposal = await insertRow(client, "transaction_proposals", {
        ...rows.transaction_proposals,
        id: randomUUID(),
        conversationId: conversation.id,
        proposerId: user.id,
      });
      expect(proposal.status).toBe("PENDING");
    });
  });

  // Slot unique Media có phạm vi từng listing, gồm slot cover và video.
  it.each(["IMAGE", "VIDEO"])("allows %s on another listing", async (type) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const first = await updateRow(client, "media_assets", rows.media_assets.id, {
        type,
        isCover: type === "IMAGE",
        durationSeconds: type === "VIDEO" ? 1 : null,
      });
      const listing = await insertRow(client, "listings", { ...rows.listings, id: randomUUID() });
      const second = await insertRow(client, "media_assets", {
        ...first,
        id: randomUUID(),
        storageKey: `test/${randomUUID()}`,
        listingId: listing.id,
      });
      expect(second.listingId).toBe(listing.id);
    });
  });

  // Thông báo chưa đọc có phạm vi kết hợp người nhận và conversation.
  it("allows unread messages for a different recipient", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const second = await insertRow(client, "notifications", {
        ...rows.notifications,
        id: randomUUID(),
        recipientId: rows.conversations.initiatorId ?? null,
        eventKey: randomUUID(),
      });
      expect(second.isRead).toBe(false);
    });
  });
});
