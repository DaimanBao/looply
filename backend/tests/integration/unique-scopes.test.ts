import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFixtures, insertRow, updateRow } from "../helpers/database-fixtures";
import { withTestTransaction } from "../helpers/test-database";

describe("Independent unique key scopes", () => {
  // Follow and block are directional; the reverse pair is a different relationship.
  it.each([
    { table: "user_follows", from: "followerId", to: "followingId" },
    { table: "user_blocks", from: "blockerId", to: "blockedId" },
  ] as const)("allows reverse pair in $table", async ({ table, from, to }) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const first = rows[table];
      const reverse = await insertRow(client, table, { ...first, id: randomUUID(), [from]: first[to] ?? null, [to]: first[from] ?? null });
      expect(reverse[from]).toBe(first[to]);
    });
  });

  // A consumer may process many events; different consumers may process the same event.
  it("allows the same event for another consumer", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const receipt = await insertRow(client, "processed_events", { ...rows.processed_events, id: randomUUID(), consumerName: "other-test-consumer" });
      expect(receipt.eventId).toBe(rows.outbox_events.id);
    });
  });

  // A listing can have multiple contacts and each conversation has its own pending slot.
  it("allows different contacts and pending proposals on the same listing", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const user = await insertRow(client, "users", { id: randomUUID(), username: `test_${randomUUID().slice(0, 8)}`, displayName: "Another contact", updatedAt: new Date() });
      const conversation = await insertRow(client, "conversations", { ...rows.conversations, id: randomUUID(), initiatorId: user.id, contactUserId: user.id });
      const proposal = await insertRow(client, "transaction_proposals", { ...rows.transaction_proposals, id: randomUUID(), conversationId: conversation.id, proposerId: user.id });
      expect(proposal.status).toBe("PENDING");
    });
  });

  // Media unique slots are local to a listing, including cover and video slots.
  it.each(["IMAGE", "VIDEO"])("allows %s on another listing", async (type) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const first = await updateRow(client, "media_assets", rows.media_assets.id, { type, isCover: type === "IMAGE", durationSeconds: type === "VIDEO" ? 1 : null });
      const listing = await insertRow(client, "listings", { ...rows.listings, id: randomUUID() });
      const second = await insertRow(client, "media_assets", { ...first, id: randomUUID(), storageKey: `test/${randomUUID()}`, listingId: listing.id });
      expect(second.listingId).toBe(listing.id);
    });
  });

  // Unread notifications are scoped to recipient and conversation together.
  it("allows unread messages for a different recipient", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const second = await insertRow(client, "notifications", { ...rows.notifications, id: randomUUID(), recipientId: rows.conversations.initiatorId ?? null, eventKey: randomUUID() });
      expect(second.isRead).toBe(false);
    });
  });
});
