import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFixtures, insertRow, updateRow, type SqlValue } from "../helpers/database-fixtures";
import { withTestTransaction } from "../helpers/test-database";

describe("Media partial unique indexes", () => {
  // Tính duy nhất cover áp dụng theo listing và chỉ cho cover còn hiệu lực.
  it("rejects a second cover for the same listing", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const first = await updateRow(client, "media_assets", rows.media_assets.id, {
        isCover: true,
      });
      await expect(
        insertRow(client, "media_assets", {
          ...first,
          id: randomUUID(),
          storageKey: `test/${randomUUID()}`,
        }),
      ).rejects.toMatchObject({ code: "23505", constraint: "uq_listing_cover" });
    });
  });

  // Ảnh không phải cover có thể cùng tồn tại; thay cover giải phóng slot unique.
  it("allows other images and replacement of a detached cover", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await updateRow(client, "media_assets", rows.media_assets.id, { isCover: true });
      const second = await insertRow(client, "media_assets", {
        ...rows.media_assets,
        id: randomUUID(),
        storageKey: `test/${randomUUID()}`,
      });
      await updateRow(client, "media_assets", rows.media_assets.id, {
        isCover: false,
        deletedAt: new Date(),
      });
      expect((await updateRow(client, "media_assets", second.id, { isCover: true })).isCover).toBe(
        true,
      );
    });
  });

  // Video còn hiệu lực chiếm slot; video xóa mềm giải phóng slot.
  it.each([false, true])("video uniqueness with deleted first = %s", async (deleted) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const first = await updateRow(client, "media_assets", rows.media_assets.id, {
        type: "VIDEO",
        durationSeconds: 180,
        mimeType: "video/mp4",
        deletedAt: deleted ? new Date() : null,
      });
      const write = insertRow(client, "media_assets", {
        ...first,
        id: randomUUID(),
        storageKey: `test/${randomUUID()}`,
        deletedAt: null,
      });
      if (deleted) expect((await write).id).not.toBe(first.id);
      else
        await expect(write).rejects.toMatchObject({
          code: "23505",
          constraint: "uq_listing_video",
        });
    });
  });
});

describe("Proposal partial unique indexes", () => {
  // Giới hạn đề xuất đang chờ theo conversation, độc lập chu kỳ lịch sử.
  it("rejects a second pending proposal even in a later cycle", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await expect(
        insertRow(client, "transaction_proposals", {
          ...rows.transaction_proposals,
          id: randomUUID(),
          createdCycle: 2,
        }),
      ).rejects.toMatchObject({ code: "23505", constraint: "uq_pending_proposal" });
    });
  });

  // Đề xuất kết thúc không chiếm slot đang chờ và vẫn nằm trong lịch sử.
  it.each(["ACCEPTED", "REJECTED"])("allows a new pending proposal after %s", async (status) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await updateRow(client, "transaction_proposals", rows.transaction_proposals.id, {
        status,
        resolvedAt: new Date(),
        acceptedCycle: status === "ACCEPTED" ? 1 : null,
      });
      const next = await insertRow(client, "transaction_proposals", {
        ...rows.transaction_proposals,
        id: randomUUID(),
      });
      expect(next.status).toBe("PENDING");
    });
  });

  // SALE/EXCHANGE có một chấp nhận mỗi chu kỳ listing; RENT không có giới hạn này.
  it.each([
    { type: "SALE", later: false, allowed: false },
    { type: "EXCHANGE", later: false, allowed: false },
    { type: "SALE", later: true, allowed: true },
    { type: "EXCHANGE", later: true, allowed: true },
    { type: "RENT", later: false, allowed: true },
  ])("$type acceptance with later cycle = $later", async ({ type, later, allowed }) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const first = await updateRow(
        client,
        "transaction_proposals",
        rows.transaction_proposals.id,
        {
          type,
          proposalKind: type === "EXCHANGE" ? "EXCHANGE_CONTACT" : "LISTED_PRICE",
          proposedPrice: type === "EXCHANGE" ? null : "100000",
          rentalUnit: type === "RENT" ? "DAY" : null,
          status: "ACCEPTED",
          acceptedCycle: 1,
          resolvedAt: new Date(),
        },
      );
      const write = insertRow(client, "transaction_proposals", {
        ...first,
        id: randomUUID(),
        acceptedCycle: later ? 2 : 1,
      });
      if (allowed) expect((await write).status).toBe("ACCEPTED");
      else
        await expect(write).rejects.toMatchObject({
          code: "23505",
          constraint: "uq_accepted_proposal_cycle",
        });
    });
  });
});

describe("Notification partial unique indexes", () => {
  // Chỉ thông báo MESSAGE còn hiệu lực chưa đọc dùng chung slot theo người nhận/conversation.
  it.each<{ name: string; changes: Record<string, SqlValue>; allowed: boolean }>([
    { name: "duplicate unread", changes: {}, allowed: false },
    { name: "read history", changes: { isRead: true, readAt: new Date() }, allowed: true },
    { name: "deleted history", changes: { deletedAt: new Date() }, allowed: true },
    { name: "transaction notification", changes: { type: "TRANSACTION" }, allowed: true },
  ])("$name", async ({ changes, allowed }) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const first = Object.keys(changes).length
        ? await updateRow(client, "notifications", rows.notifications.id, changes)
        : rows.notifications;
      const write = insertRow(client, "notifications", {
        ...rows.notifications,
        id: randomUUID(),
        eventKey: randomUUID(),
      });
      if (allowed) expect((await write).id).not.toBe(first.id);
      else
        await expect(write).rejects.toMatchObject({
          code: "23505",
          constraint: "uq_unread_message_notification",
        });
    });
  });

  // Chống trùng sự kiện vẫn tồn tại sau đọc/xóa; khóa NULL và người nhận khác độc lập.
  it.each(["duplicate", "deleted", "null", "other recipient"])(
    "event key scope: %s",
    async (scope) => {
      await withTestTransaction(async (client) => {
        const rows = await createFixtures(client);
        const first = await updateRow(client, "notifications", rows.notifications.id, {
          isRead: true,
          readAt: new Date(),
          eventKey: scope === "null" ? null : (rows.notifications.eventKey ?? null),
          deletedAt: scope === "deleted" ? new Date() : null,
        });
        const write = insertRow(client, "notifications", {
          ...first,
          id: randomUUID(),
          recipientId:
            scope === "other recipient"
              ? (rows.conversations.initiatorId ?? null)
              : (first.recipientId ?? null),
        });
        if (scope === "null" || scope === "other recipient")
          expect((await write).id).not.toBe(first.id);
        else
          await expect(write).rejects.toMatchObject({
            code: "23505",
            constraint: "uq_notification_event_key",
          });
      });
    },
  );
});
