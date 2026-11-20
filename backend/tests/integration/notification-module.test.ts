import { randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthFixture, type AuthFixture } from "../helpers/auth-fixture";
import type { Principal } from "../../src/modules/auth";
import { NotificationOutboxRepository } from "../../src/modules/notification/notification-outbox.repository";
import { NotificationWorker } from "../../src/modules/notification/notification.worker";
import { ChatRepository } from "../../src/modules/chat/chat.repository";

let fixture: AuthFixture;
let sender: Principal;
let recipient: Principal;
let token: string;
let otherToken: string;
let conversationId: string;
beforeEach(async () => {
  fixture = await createAuthFixture();
  const first = await fixture.user();
  const second = await fixture.user();
  const third = await fixture.user();
  const sessions = await fixture.db.$transaction(async (tx) =>
    Promise.all([first, second, third].map((user) => fixture.sessions.create(user, tx))),
  );
  sender = await fixture.sessions.authenticate(sessions[0].accessToken);
  recipient = await fixture.sessions.authenticate(sessions[1].accessToken);
  token = sessions[1].accessToken;
  otherToken = sessions[2].accessToken;
  conversationId = (
    await fixture.chat.conversations.create(sender, { type: "DIRECT", userId: recipient.userId })
  ).id;
}, 15000);

afterEach(async () => {
  vi.restoreAllMocks();
  if (fixture) await fixture.dispose();
}, 15000);

/** Tin nhắn đi qua application service thật, không seed Notification thay nghiệp vụ. */
function send(content = "Nội dung riêng tư không được xuất hiện trong thông báo") {
  return fixture.chat.messages.send(sender, conversationId, { requestId: randomUUID(), content });
}

/** Drain lô bounded trong database test đã được fixture xác minh. */
async function drain(): Promise<void> {
  for (let index = 0; index < 100; index++)
    if (!(await fixture.notifications.worker.runOnce())) return;
  throw new Error("Unexpected notification backlog");
}

/** Lấy projection tương tự REST để assertions không dựa vào private field. */
async function list() {
  return fixture.notifications.service.list(recipient, { limit: 30 });
}

describe("Notification PostgreSQL/HTTP integration", () => {
  it("uses monotonic event boundaries so read-all includes captured rows and never swallows a subsequent event", async () => {
    const boundary = new Date(Date.now() + 86400000);
    await fixture.db.notification.create({
      data: { recipientId: recipient.userId, conversationId, type: "MESSAGE", updatedAt: boundary },
    });
    const captured = await list();
    await send();
    await drain();
    const latest = await list();
    expect(new Date(latest.asOf).getTime()).toBeGreaterThan(boundary.getTime());
    await fixture.notifications.service.readAll(recipient, new Date(captured.asOf));
    expect(await fixture.notifications.service.count(recipient)).toEqual({ count: 1 });
    await fixture.notifications.service.readAll(recipient, new Date(latest.asOf));
    expect(await fixture.notifications.service.count(recipient)).toEqual({ count: 0 });
  });
  it("groups concurrent messages, keeps latest, hides previews and preserves independent Chat unread", async () => {
    const sent = await Promise.all([send("Một"), send("Hai"), send("Ba")]);
    await Promise.all([drain(), drain()]);
    const page = await list();
    expect(page.data).toHaveLength(1);
    expect(page.data[0].type).toBe("MESSAGE");
    expect(page.data[0].latestMessageId).toBe(
      (await fixture.chat.messages.history(recipient, conversationId, { limit: 30 })).data[0].id,
    );
    expect(sent.some((message) => JSON.stringify(page).includes(message.content!))).toBe(false);
    expect(await fixture.notifications.service.count(recipient)).toEqual({ count: 1 });
    expect(await fixture.notifications.service.count(sender)).toEqual({ count: 0 });
    await fixture.notifications.service.read(recipient, page.data[0].id, page.data[0].lastEventId);
    expect((await fixture.chat.conversations.get(recipient, conversationId)).unreadCount).toBe(3);
    await send();
    await drain();
    expect((await list()).data).toHaveLength(2);
    expect(await fixture.notifications.service.count(recipient)).toEqual({ count: 1 });
  });

  it("captures presence when sending, not when a delayed worker runs; other conversations do not suppress", async () => {
    fixture.notifications.presence.view("socket", recipient.userId, conversationId, true);
    const message = await send();
    fixture.notifications.presence.leave("socket");
    await drain();
    expect((await list()).data).toHaveLength(0);
    expect(
      (await fixture.chat.messages.history(recipient, conversationId, { limit: 30 })).data[0].id,
    ).toBe(message.id);
    fixture.notifications.presence.view("socket", recipient.userId, randomUUID(), true);
    await send();
    await drain();
    expect((await list()).data).toHaveLength(1);
  });

  it("does not suppress messages using a revoked presence authority", async () => {
    fixture.notifications.presence.view(
      "socket",
      recipient.userId,
      conversationId,
      true,
      async () => false,
    );
    await send();
    await drain();
    expect((await list()).data).toHaveLength(1);
  });

  it("rejects stale read boundaries and keeps events arriving after read-all capture unread", async () => {
    await send();
    await drain();
    const before = await list();
    await send();
    await drain();
    await request(fixture.app)
      .put(`/api/notifications/${before.data[0].id}/read`)
      .auth(token, { type: "bearer" })
      .send({ expectedEventId: before.data[0].lastEventId })
      .expect(409);
    await fixture.notifications.service.readAll(recipient, new Date(before.asOf));
    expect(await fixture.notifications.service.count(recipient)).toEqual({ count: 1 });
    const current = await list();
    await fixture.notifications.service.read(
      recipient,
      current.data[0].id,
      current.data[0].lastEventId,
    );
    await fixture.notifications.service.read(
      recipient,
      current.data[0].id,
      current.data[0].lastEventId,
    );
    expect(await fixture.notifications.service.count(recipient)).toEqual({ count: 0 });
  });

  it("soft deletes idempotently and retry of an old event cannot resurrect it", async () => {
    const message = await send();
    await drain();
    const item = (await list()).data[0];
    await fixture.notifications.service.remove(recipient, item.id);
    await fixture.notifications.service.remove(recipient, item.id);
    await fixture.db.outboxEvent.update({
      where: { id: item.lastEventId! },
      data: { status: "PENDING" },
    });
    await drain();
    expect((await list()).data).toHaveLength(0);
    expect(await fixture.db.notification.count({ where: { conversationId } })).toBe(1);
    expect(await fixture.db.message.findUnique({ where: { id: message.id } })).not.toBeNull();
    await send();
    await drain();
    expect((await list()).data).toHaveLength(1);
  });

  it("enforces REST authentication, ownership, strict input and validates current targets", async () => {
    await send();
    await drain();
    const item = (await list()).data[0];
    await request(fixture.app).get("/api/notifications").expect(401);
    await request(fixture.app)
      .get("/api/notifications?limit=51")
      .auth(token, { type: "bearer" })
      .expect(400);
    await request(fixture.app)
      .get(`/api/notifications?recipientId=${sender.userId}`)
      .auth(token, { type: "bearer" })
      .expect(400);
    await request(fixture.app)
      .put(`/api/notifications/${item.id}/read`)
      .auth(token, { type: "bearer" })
      .send({})
      .expect(400);
    for (const path of [
      `/api/notifications/${item.id}/target`,
      `/api/notifications/${randomUUID()}/target`,
    ]) {
      await request(fixture.app).get(path).auth(otherToken, { type: "bearer" }).expect(404);
    }
    await request(fixture.app)
      .delete(`/api/notifications/${item.id}`)
      .auth(otherToken, { type: "bearer" })
      .expect(404);
    const page = await request(fixture.app)
      .get("/api/notifications")
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(page.headers["cache-control"]).toContain("no-store");
    const target = await request(fixture.app)
      .get(`/api/notifications/${item.id}/target`)
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(target.body.conversationId).toBe(conversationId);
    await fixture.db.conversationParticipant.delete({
      where: { conversationId_userId: { conversationId, userId: recipient.userId } },
    });
    await request(fixture.app)
      .get(`/api/notifications/${item.id}/target`)
      .auth(token, { type: "bearer" })
      .expect(404);
  });

  it("uses stable keysets with equal timestamps, deleted boundary and account-scoped cursors", async () => {
    const stamp = new Date(Date.now() - 10000);
    await fixture.db.notification.createMany({
      data: Array.from({ length: 4 }, () => ({
        recipientId: recipient.userId,
        type: "LISTING_UPDATED" as const,
        conversationId,
        createdAt: stamp,
      })),
    });
    const first = await fixture.notifications.service.list(recipient, { limit: 2 });
    await fixture.notifications.service.remove(recipient, first.data[1].id);
    const second = await fixture.notifications.service.list(recipient, {
      limit: 2,
      after: first.pagination.nextCursor!,
    });
    expect(new Set([...first.data, ...second.data].map((row) => row.id)).size).toBe(4);
    await expect(
      fixture.notifications.service.list(sender, { limit: 2, after: first.pagination.nextCursor! }),
    ).rejects.toMatchObject({ status: 400 });
    await request(fixture.app)
      .put("/api/notifications/read-all")
      .auth(token, { type: "bearer" })
      .send({ through: new Date(Date.now() + 60000).toISOString() })
      .expect(400);
    await request(fixture.app)
      .put("/api/notifications/read-all")
      .auth(token, { type: "bearer" })
      .send({ through: first.asOf })
      .expect(204);
    expect(await fixture.notifications.service.count(recipient)).toEqual({ count: 0 });
  });

  it("rechecks Block/account status before processing delayed events", async () => {
    await send();
    await fixture.db.userBlock.create({
      data: { blockerId: recipient.userId, blockedId: sender.userId },
    });
    await drain();
    expect((await list()).data).toHaveLength(0);
    await fixture.db.userBlock.deleteMany({ where: { blockerId: recipient.userId } });
    await send();
    await fixture.db.user.update({
      where: { id: recipient.userId },
      data: { status: "PENDING_DELETION", deletionRequestedAt: new Date() },
    });
    await drain();
    expect(await fixture.db.notification.count({ where: { recipientId: recipient.userId } })).toBe(
      0,
    );
  });

  it("rolls back Notification and receipt on consumer failure and retries without duplicates", async () => {
    await send();
    const original = NotificationOutboxRepository.prototype.complete;
    vi.spyOn(NotificationOutboxRepository.prototype, "complete")
      .mockImplementationOnce(async () => {
        throw new Error("Injected completion failure");
      })
      .mockImplementation(original);
    await fixture.notifications.worker.runOnce();
    expect(await fixture.db.notification.count({ where: { conversationId } })).toBe(0);
    const event = await fixture.db.outboxEvent.findFirstOrThrow({
      where: { aggregateId: conversationId },
    });
    expect(event.status).toBe("FAILED");
    expect(event.lastError).toBe("NOTIFICATION_RETRY");
    expect(await fixture.db.processedEvent.count({ where: { eventId: event.id } })).toBe(0);
    await fixture.db.outboxEvent.update({
      where: { id: event.id },
      data: { nextRetryAt: new Date(0) },
    });
    await drain();
    expect((await list()).data).toHaveLength(1);
    expect(
      await fixture.db.processedEvent.count({
        where: { eventId: event.id, consumerName: "notification" },
      }),
    ).toBe(1);
  });

  it("fences stale leases so an old worker cannot publish Notification or overwrite the newer claim", async () => {
    await send();
    const repository = new NotificationOutboxRepository(fixture.db);
    const claimed = await repository.claim();
    if (!claimed) throw new Error("Missing test claim");
    await fixture.db.outboxEvent.update({
      where: { id: claimed.id },
      data: { attempts: { increment: 1 } },
    });
    vi.spyOn(repository, "claim").mockResolvedValueOnce(claimed);
    await new NotificationWorker(repository, fixture.notifications.events).runOnce();
    expect(await fixture.db.notification.count({ where: { conversationId } })).toBe(0);
    const current = await fixture.db.outboxEvent.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(current.status).toBe("PROCESSING");
    expect(current.attempts).toBe(claimed.attempts + 1);
    await fixture.db.outboxEvent.update({
      where: { id: claimed.id },
      data: { lockedUntil: new Date(0) },
    });
    await drain();
    expect((await list()).data).toHaveLength(1);
  });

  it("a failed Chat transaction does not create an outbox event or Notification", async () => {
    vi.spyOn(ChatRepository.prototype, "event").mockRejectedValueOnce(
      new Error("Injected producer rollback"),
    );
    await expect(send()).rejects.toThrow("Injected producer rollback");
    await drain();
    expect(await fixture.db.message.count({ where: { conversationId } })).toBe(0);
    expect((await list()).data).toHaveLength(0);
  });

  it.each(["ACCEPTED", "REJECTED"] as const)(
    "notifies related contacts on confirmed Listing edits and routes %s to the proposer",
    async (status) => {
      const province = await fixture.province();
      const bytes = await sharp({
        create: { width: 50, height: 50, channels: 3, background: "#226644" },
      })
        .png()
        .toBuffer();
      const upload = await fixture.listingUploads.upload(sender, bytes);
      const listing = await fixture.listings.create(sender, {
        title: "Xe đạp kiểm thử Notification",
        description: "Xe đạp đã qua sử dụng còn tốt.",
        type: "SALE",
        price: "200000",
        rentalUnit: null,
        provinceCode: province.code,
        media: { imageIds: [upload.id], videoId: null },
      });
      conversationId = (
        await fixture.chat.conversations.create(recipient, {
          type: "LISTING",
          listingId: listing.id,
        })
      ).id;
      await expect(
        fixture.listings.update(listing.id, sender, {
          expectedVersion: listing.version,
          title: "Xe đạp mới chỉnh sửa",
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await fixture.notifications.worker.runOnce()).toBe(false);
      await fixture.listings.update(listing.id, sender, {
        expectedVersion: listing.version,
        confirmConversationImpact: true,
        title: "Xe đạp mới chỉnh sửa",
      });
      const unrelated = await fixture.sessions.authenticate(otherToken);
      await fixture.chat.conversations.create(unrelated, {
        type: "LISTING",
        listingId: listing.id,
      });
      await drain();
      expect((await list()).data[0].type).toBe("LISTING_UPDATED");
      expect(await fixture.notifications.service.count(sender)).toEqual({ count: 0 });
      expect(await fixture.notifications.service.count(unrelated)).toEqual({ count: 0 });
      fixture.notifications.presence.view("owner", sender.userId, conversationId, true);
      const card = await fixture.chat.proposals.create(recipient, conversationId, {
        requestId: randomUUID(),
        kind: "NEGOTIATED_PRICE",
        proposedPrice: "150000",
      });
      await drain();
      expect(
        (await fixture.notifications.service.list(sender, { limit: 30 })).data[0],
      ).toMatchObject({ type: "TRANSACTION", proposalId: card.proposal!.id });
      await fixture.chat.proposals.resolve(sender, conversationId, card.proposal!.id, status);
      await drain();
      const result = (await list()).data.find((row) => row.type === "TRANSACTION");
      expect(result?.proposalId).toBe(card.proposal!.id);
      expect(
        (await fixture.db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status,
      ).toBe(status === "ACCEPTED" ? "HIDDEN" : "ACTIVE");
      const count = await fixture.db.notification.count({ where: { conversationId } });
      await fixture.chat.proposals.resolve(sender, conversationId, card.proposal!.id, status);
      await drain();
      expect(await fixture.db.notification.count({ where: { conversationId } })).toBe(count);
    },
  );
});
