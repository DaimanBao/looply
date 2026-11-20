import { randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthFixture, type AuthFixture } from "../helpers/auth-fixture";
import type { Principal } from "../../src/modules/auth";
import { lockResources } from "../../src/shared/database/locks";
import { MediaCleanupRepository } from "../../src/modules/media/media-cleanup.repository";
import { listingContract } from "../helpers/listing-contract";
import { ChatRepository } from "../../src/modules/chat/chat.repository";

type Actor = { principal: Principal; token: string };
let fixture: AuthFixture;
let owner: Actor;
let contact: Actor;
let stranger: Actor;
let image: Buffer;
beforeEach(async () => {
  fixture = await createAuthFixture();
  owner = await identity();
  contact = await identity();
  stranger = await identity();
  image = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#226644" } })
    .png()
    .toBuffer();
}, 15000);
afterEach(async () => {
  vi.restoreAllMocks();
  if (fixture) await fixture.dispose();
}, 15000);

/** Tạo phiên Auth thật cho các ca Chat, không giả danh participant qua HTTP. */
async function identity(): Promise<Actor> {
  const user = await fixture.user();
  const session = await fixture.db.$transaction((tx) => fixture.sessions.create(user, tx));
  return {
    principal: await fixture.sessions.authenticate(session.accessToken),
    token: session.accessToken,
  };
}

/** Tạo Listing và ảnh thật qua module đã triển khai, dùng Province fixture độc lập. */
async function listing(type: "SALE" | "RENT" | "EXCHANGE" = "SALE") {
  const province = await fixture.province();
  const upload = await fixture.listingUploads.upload(owner.principal, image);
  return fixture.listings.create(owner.principal, {
    title: "Xe đạp dùng thử Chat",
    description: "Xe đạp còn tốt cho kiểm thử giao dịch.",
    type,
    price: type === "EXCHANGE" ? null : "250000",
    rentalUnit: type === "RENT" ? "DAY" : null,
    provinceCode: province.code,
    media: { imageIds: [upload.id], videoId: null },
  });
}

/** Mở Conversation thông qua cùng application service mà REST/socket sử dụng. */
async function direct() {
  return fixture.chat.conversations.create(contact.principal, {
    type: "DIRECT",
    userId: owner.principal.userId,
  });
}

/** Tạo card thương lượng với requestId riêng; ảnh snapshot đi qua storage adapter thật của fixture. */
async function card(conversationId: string) {
  return fixture.chat.proposals.create(contact.principal, conversationId, {
    requestId: randomUUID(),
    kind: "NEGOTIATED_PRICE",
    proposedPrice: "200000",
  });
}

describe("Chat PostgreSQL/HTTP integration", () => {
  it("keeps snapshot bytes and historical text after real owner account cleanup", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const sent = await card(row.id);
    const requestedAt = new Date(Date.now() - 31 * 86400000);
    await fixture.db.user.update({
      where: { id: owner.principal.userId },
      data: { status: "PENDING_DELETION", deletionRequestedAt: requestedAt },
    });
    await fixture.db.outboxEvent.create({
      data: {
        aggregateType: "User",
        aggregateId: owner.principal.userId,
        eventType: "account.delete",
        payload: { requestedAt: requestedAt.toISOString() },
      },
    });
    await fixture.cleanup.runOnce();
    expect(
      (await fixture.db.user.findUniqueOrThrow({ where: { id: owner.principal.userId } })).status,
    ).toBe("DELETED");
    expect(
      (await fixture.chat.proposals.image(contact.principal, row.id, sent.id)).length,
    ).toBeGreaterThan(0);
    expect(
      (await fixture.chat.messages.history(contact.principal, row.id, { limit: 30 })).data[0]
        .snapshot?.title,
    ).toBe(item.title);
  });

  it("rolls back card publication when the final SQL lease fence has expired", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const publish = ChatRepository.prototype.publishSnapshot;
    vi.spyOn(ChatRepository.prototype, "publishSnapshot").mockImplementation(
      async (id, messageId, size, createdAt, tx) => {
        await tx.listingCardSnapshot.update({
          where: { id },
          data: { createdAt: new Date(Date.now() - 901_000) },
        });
        return publish(id, messageId, size, createdAt, tx);
      },
    );
    await expect(card(row.id)).rejects.toMatchObject({ code: "SNAPSHOT_CHANGED" });
    expect(await fixture.db.message.count({ where: { conversationId: row.id } })).toBe(0);
    expect(await fixture.db.transactionProposal.count({ where: { conversationId: row.id } })).toBe(
      0,
    );
  });

  it("rejects invalid/oversized Chat image bytes and cleans a late upload after expiry", async () => {
    const row = await direct();
    for (const [bytes, status] of [
      [Buffer.from("invalid image"), 415],
      [Buffer.alloc(10 * 1024 * 1024 + 1), 413],
    ] as const)
      await request(fixture.app)
        .post(`/api/conversations/${row.id}/images`)
        .auth(contact.token, { type: "bearer" })
        .set("Content-Type", "application/octet-stream")
        .send(bytes)
        .expect(status);
    const actual = fixture.storage.put.bind(fixture.storage);
    let mediaId = "";
    vi.spyOn(fixture.storage, "put").mockImplementation(async (key, bytes) => {
      if (key.startsWith("chat/")) {
        const asset = await fixture.db.mediaAsset.findFirstOrThrow({
          where: { chatConversationId: row.id },
        });
        mediaId = asset.id;
        await fixture.db.mediaAsset.update({
          where: { id: asset.id },
          data: { expiresAt: new Date(Date.now() - 1) },
        });
        await fixture.chat.retention.runOnce();
      }
      await actual(key, bytes);
    });
    await expect(
      fixture.chat.messages.upload(contact.principal, row.id, image),
    ).rejects.toMatchObject({ code: "UPLOAD_EXPIRED" });
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } })).deletedAt,
    ).toBeNull();
    await fixture.chat.retention.runOnce();
    expect(fixture.objects.has(`chat/${mediaId}.webp`)).toBe(false);
  });
  it("creates one DIRECT conversation under concurrent reverse requests", async () => {
    const rows = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        fixture.chat.conversations.create(i % 2 ? owner.principal : contact.principal, {
          type: "DIRECT",
          userId: i % 2 ? contact.principal.userId : owner.principal.userId,
        }),
      ),
    );
    expect(new Set(rows.map((row) => row.id)).size).toBe(1);
    expect(rows[0].participants).toHaveLength(2);
    expect(
      listingContract("ChatConversation").safeParse(JSON.parse(JSON.stringify(rows[0]))).success,
    ).toBe(true);
  });

  it("creates one listing conversation and prevents self, inactive and blocked creation", async () => {
    const item = await listing();
    const rows = await Promise.all(
      Array.from({ length: 5 }, () =>
        fixture.chat.conversations.create(contact.principal, {
          type: "LISTING",
          listingId: item.id,
        }),
      ),
    );
    expect(new Set(rows.map((row) => row.id)).size).toBe(1);
    await expect(
      fixture.chat.conversations.create(owner.principal, { type: "LISTING", listingId: item.id }),
    ).rejects.toMatchObject({ status: 403 });
    await fixture.db.userBlock.create({
      data: { blockerId: owner.principal.userId, blockedId: stranger.principal.userId },
    });
    await expect(
      fixture.chat.conversations.create(stranger.principal, {
        type: "LISTING",
        listingId: item.id,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await fixture.db.listing.update({ where: { id: item.id }, data: { status: "HIDDEN" } });
    await expect(
      fixture.chat.conversations.create(stranger.principal, {
        type: "LISTING",
        listingId: item.id,
      }),
    ).rejects.toBeDefined();
    expect(
      (
        await fixture.chat.conversations.create(contact.principal, {
          type: "LISTING",
          listingId: item.id,
        })
      ).id,
    ).toBe(rows[0].id);
  });

  it("enforces API auth, strict payload and IDOR for history, read, image and proposal", async () => {
    const row = await direct();
    await request(fixture.app).get(`/api/conversations/${row.id}`).expect(401);
    for (const path of [
      `/api/conversations/${row.id}`,
      `/api/conversations/${row.id}/messages`,
      `/api/conversations/${row.id}/messages/${randomUUID()}/image`,
    ])
      await request(fixture.app).get(path).auth(stranger.token, { type: "bearer" }).expect(404);
    await request(fixture.app)
      .post(`/api/conversations/${row.id}/messages`)
      .auth(contact.token, { type: "bearer" })
      .send({ requestId: randomUUID(), content: "xin chào", senderId: owner.principal.userId })
      .expect(400);
    await request(fixture.app)
      .put(`/api/conversations/${row.id}/read`)
      .auth(stranger.token, { type: "bearer" })
      .send({ messageId: randomUUID() })
      .expect(404);
    const result = await request(fixture.app)
      .post(`/api/conversations/${row.id}/messages`)
      .auth(contact.token, { type: "bearer" })
      .send({ requestId: randomUUID(), content: "Xin chào 😀" })
      .expect(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(listingContract("ChatMessage").safeParse(result.body).success).toBe(true);
    expect(JSON.stringify(result.body)).not.toMatch(/payloadHash|storageKey|passwordHash/);
  });

  it("persists one Message/event for concurrent retries and rejects changed payload", async () => {
    const row = await direct();
    const input = { requestId: randomUUID(), content: "Đã gửi" };
    const results = await Promise.all(
      Array.from({ length: 6 }, () => fixture.chat.messages.send(contact.principal, row.id, input)),
    );
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(await fixture.db.message.count({ where: { conversationId: row.id } })).toBe(1);
    expect(
      await fixture.db.outboxEvent.count({
        where: { aggregateId: row.id, eventType: "chat.message.created" },
      }),
    ).toBe(1);
    const activity = (await fixture.db.conversation.findUniqueOrThrow({ where: { id: row.id } }))
      .lastActivityAt;
    await expect(
      fixture.chat.messages.send(contact.principal, row.id, { ...input, content: "Khác" }),
    ).rejects.toMatchObject({ code: "REQUEST_CONFLICT" });
    await fixture.chat.messages.send(contact.principal, row.id, input);
    expect(
      (await fixture.db.conversation.findUniqueOrThrow({ where: { id: row.id } })).lastActivityAt,
    ).toEqual(activity);
  });

  it("paginates tied timestamps without duplicates and rejects cross-user cursors", async () => {
    const row = await direct();
    const time = new Date();
    await fixture.db.message.createMany({
      data: Array.from({ length: 35 }, () => ({
        id: randomUUID(),
        conversationId: row.id,
        senderId: contact.principal.userId,
        requestId: randomUUID(),
        type: "TEXT" as const,
        content: "Lịch sử",
        payloadHash: "fixture",
        createdAt: time,
      })),
    });
    const first = await fixture.chat.messages.history(owner.principal, row.id, { limit: 30 });
    const second = await fixture.chat.messages.history(owner.principal, row.id, {
      limit: 30,
      after: first.pagination.nextCursor!,
    });
    expect(first.data).toHaveLength(30);
    expect(second.data).toHaveLength(5);
    expect(new Set([...first.data, ...second.data].map((message) => message.id)).size).toBe(35);
    await expect(
      fixture.chat.messages.history(contact.principal, row.id, {
        limit: 30,
        after: first.pagination.nextCursor!,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });

  it("tracks delivered/read monotonically and restores only after a new committed message", async () => {
    const row = await direct();
    const a = await fixture.chat.messages.send(contact.principal, row.id, {
      requestId: randomUUID(),
      content: "Một",
    });
    const b = await fixture.chat.messages.send(contact.principal, row.id, {
      requestId: randomUUID(),
      content: "Hai",
    });
    await fixture.chat.messages.receipt(owner.principal, row.id, b.id, false);
    expect(
      (await fixture.chat.messages.history(contact.principal, row.id, { limit: 30 })).data[0].state,
    ).toBe("DELIVERED");
    await fixture.chat.messages.receipt(owner.principal, row.id, b.id, true);
    await fixture.chat.messages.receipt(owner.principal, row.id, a.id, true);
    expect((await fixture.chat.conversations.get(owner.principal, row.id)).unreadCount).toBe(0);
    await fixture.chat.conversations.hide(owner.principal, row.id);
    expect(
      (await fixture.chat.conversations.inbox(owner.principal, { limit: 30 })).data,
    ).toHaveLength(0);
    expect(
      (await fixture.chat.conversations.inbox(contact.principal, { limit: 30 })).data,
    ).toHaveLength(1);
    await fixture.chat.messages.send(contact.principal, row.id, {
      requestId: a.requestId,
      content: "Một",
    });
    expect(
      (await fixture.chat.conversations.inbox(owner.principal, { limit: 30 })).data,
    ).toHaveLength(0);
    await fixture.chat.messages.send(contact.principal, row.id, {
      requestId: randomUUID(),
      content: "Mới",
    });
    expect((await fixture.chat.conversations.get(owner.principal, row.id)).unreadCount).toBe(1);
    expect(
      (await fixture.chat.conversations.inbox(owner.principal, { limit: 30 })).data,
    ).toHaveLength(1);
  });

  it("blocks new messages and uploads but preserves historical reads", async () => {
    const row = await direct();
    await fixture.chat.messages.send(contact.principal, row.id, {
      requestId: randomUUID(),
      content: "Lịch sử",
    });
    await request(fixture.app)
      .put(`/api/users/${owner.principal.userId}/block`)
      .auth(contact.token, { type: "bearer" })
      .send({})
      .expect(204);
    for (const actor of [owner, contact])
      await expect(
        fixture.chat.messages.send(actor.principal, row.id, {
          requestId: randomUUID(),
          content: "Không cho phép",
        }),
      ).rejects.toMatchObject({ status: 403 });
    await expect(
      fixture.chat.messages.upload(contact.principal, row.id, image),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await fixture.chat.messages.history(owner.principal, row.id, { limit: 30 })).data,
    ).toHaveLength(1);
    await request(fixture.app)
      .delete(`/api/users/${owner.principal.userId}/block`)
      .auth(contact.token, { type: "bearer" })
      .expect(204);
    expect(
      (
        await fixture.chat.messages.send(owner.principal, row.id, {
          requestId: randomUUID(),
          content: "Sau bỏ chặn",
        })
      ).content,
    ).toBe("Sau bỏ chặn");
  });

  it("scopes image uploads to uploader and conversation, prevents reuse and preserves image after uploader deletion", async () => {
    const row = await direct();
    const other = await fixture.chat.conversations.create(contact.principal, {
      type: "DIRECT",
      userId: stranger.principal.userId,
    });
    const uploaded = await request(fixture.app)
      .post(`/api/conversations/${row.id}/images`)
      .auth(contact.token, { type: "bearer" })
      .set("Content-Type", "application/octet-stream")
      .send(image)
      .expect(201);
    const imageMediaId = z.object({ id: z.uuid() }).parse(uploaded.body).id;
    await expect(
      fixture.chat.messages.send(owner.principal, row.id, {
        requestId: randomUUID(),
        imageMediaId,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      fixture.chat.messages.send(contact.principal, other.id, {
        requestId: randomUUID(),
        imageMediaId,
      }),
    ).rejects.toMatchObject({ status: 404 });
    const sent = await fixture.chat.messages.send(contact.principal, row.id, {
      requestId: randomUUID(),
      imageMediaId,
    });
    await expect(
      fixture.chat.messages.send(contact.principal, row.id, {
        requestId: randomUUID(),
        imageMediaId,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      fixture.chat.messages.cancel(contact.principal, row.id, imageMediaId),
    ).rejects.toMatchObject({ status: 409 });
    await fixture.db.user.update({
      where: { id: contact.principal.userId },
      data: { status: "DELETED" },
    });
    expect(
      (await fixture.chat.messages.image(owner.principal, row.id, sent.id)).length,
    ).toBeGreaterThan(0);
  });

  it("rolls back image attachment and activity when message insertion fails", async () => {
    const row = await direct();
    const upload = await fixture.chat.messages.upload(contact.principal, row.id, image);
    const before = await fixture.db.conversation.findUniqueOrThrow({ where: { id: row.id } });
    await expect(
      fixture.chat.messages.send(contact.principal, row.id, {
        requestId: randomUUID(),
        imageMediaId: upload.id,
        content: "x".repeat(5001),
      }),
    ).rejects.toBeDefined();
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: upload.id } })).status,
    ).toBe("TEMP");
    expect(
      (await fixture.db.conversation.findUniqueOrThrow({ where: { id: row.id } })).lastActivityAt,
    ).toEqual(before.lastActivityAt);
  });

  it("continues old conversations on deleted listings while refusing new conversations/proposals", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    await fixture.listings.remove(item.id, owner.principal, item.version);
    await fixture.chat.messages.send(contact.principal, row.id, {
      requestId: randomUUID(),
      content: "Vẫn xem lịch sử",
    });
    await expect(card(row.id)).rejects.toMatchObject({ code: "LISTING_NOT_ACTIVE" });
    await expect(
      fixture.chat.conversations.create(stranger.principal, {
        type: "LISTING",
        listingId: item.id,
      }),
    ).rejects.toMatchObject({ code: "LISTING_NOT_ACTIVE" });
  });

  it("snapshots price/title/cover and rejects pending duplicates and unauthorized resolve", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const sent = await card(row.id);
    expect(sent.snapshot).toMatchObject({
      title: item.title,
      listedPrice: "250000",
      imageAvailable: true,
    });
    await expect(card(row.id)).rejects.toMatchObject({ code: "PROPOSAL_PENDING" });
    await expect(
      fixture.chat.proposals.resolve(contact.principal, row.id, sent.proposal!.id, "ACCEPTED"),
    ).rejects.toMatchObject({ status: 403 });
    await fixture.listings.update(item.id, owner.principal, {
      expectedVersion: 1,
      confirmConversationImpact: true,
      title: "Xe đạp tiêu đề mới",
      price: "300000",
    });
    const stored = (await fixture.chat.messages.history(owner.principal, row.id, { limit: 30 }))
      .data[0];
    expect(stored.snapshot?.title).toBe(item.title);
    expect(stored.proposal?.listedPrice).toBe("250000");
    expect(JSON.stringify(stored)).not.toMatch(/storageKey|sourceMediaId|chat-snapshot/);
    expect(
      (await fixture.chat.proposals.image(owner.principal, row.id, sent.id)).length,
    ).toBeGreaterThan(0);
  });

  it("serializes competing SALE accepts and resumes pending cards after explicit reopen", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const other = await fixture.chat.conversations.create(stranger.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const first = await card(row.id);
    const second = await fixture.chat.proposals.create(stranger.principal, other.id, {
      requestId: randomUUID(),
      kind: "LISTED_PRICE",
    });
    const results = await Promise.allSettled([
      fixture.chat.proposals.resolve(owner.principal, row.id, first.proposal!.id, "ACCEPTED"),
      fixture.chat.proposals.resolve(owner.principal, other.id, second.proposal!.id, "ACCEPTED"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    let current = await fixture.db.listing.findUniqueOrThrow({ where: { id: item.id } });
    expect(current.status).toBe("HIDDEN");
    expect(
      await fixture.db.transactionProposal.count({
        where: { listingId: item.id, status: "PENDING" },
      }),
    ).toBe(1);
    await fixture.listings.visibility(item.id, owner.principal, {
      expectedVersion: current.version,
      status: "ACTIVE",
      confirmReopenAfterAccepted: true,
    });
    const pending = await fixture.db.transactionProposal.findFirstOrThrow({
      where: { listingId: item.id, status: "PENDING" },
    });
    await fixture.chat.proposals.resolve(
      owner.principal,
      pending.conversationId,
      pending.id,
      "ACCEPTED",
    );
    current = await fixture.db.listing.findUniqueOrThrow({ where: { id: item.id } });
    expect(current.activeCycle).toBe(2);
    expect(
      await fixture.db.transactionProposal.count({
        where: { listingId: item.id, status: "ACCEPTED" },
      }),
    ).toBe(2);
  });

  it("keeps RENT active, supports EXCHANGE and only rejects negotiated cards", async () => {
    for (const type of ["RENT", "EXCHANGE"] as const) {
      const item = await listing(type);
      const row = await fixture.chat.conversations.create(contact.principal, {
        type: "LISTING",
        listingId: item.id,
      });
      const sent = await fixture.chat.proposals.create(contact.principal, row.id, {
        requestId: randomUUID(),
        kind: type === "RENT" ? "LISTED_PRICE" : "EXCHANGE_CONTACT",
      });
      await expect(
        fixture.chat.proposals.resolve(owner.principal, row.id, sent.proposal!.id, "REJECTED"),
      ).rejects.toMatchObject({ code: "PROPOSAL_NOT_REJECTABLE" });
      await fixture.chat.proposals.resolve(owner.principal, row.id, sent.proposal!.id, "ACCEPTED");
      expect((await fixture.db.listing.findUniqueOrThrow({ where: { id: item.id } })).status).toBe(
        type === "RENT" ? "ACTIVE" : "HIDDEN",
      );
      await fixture.chat.proposals.resolve(owner.principal, row.id, sent.proposal!.id, "ACCEPTED");
    }
  });

  it("cleans failed snapshot copies without publishing proposal or message", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    vi.spyOn(fixture.storage, "put").mockRejectedValueOnce(new Error("Private provider failure"));
    await expect(card(row.id)).rejects.toMatchObject({ status: 503 });
    expect(await fixture.db.message.count({ where: { conversationId: row.id } })).toBe(0);
    expect(await fixture.db.transactionProposal.count({ where: { conversationId: row.id } })).toBe(
      0,
    );
    expect(
      (await fixture.db.listingCardSnapshot.findFirstOrThrow({ where: { conversationId: row.id } }))
        .imageState,
    ).toBe("REVOKED");
    await fixture.chat.retention.runOnce();
    expect(
      (await fixture.db.listingCardSnapshot.findFirstOrThrow({ where: { conversationId: row.id } }))
        .imageState,
    ).toBe("DELETED");
  });

  it("protects source cleanup while preparing and rejects cover/version change before publish", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const replacement = await fixture.listingUploads.upload(owner.principal, image);
    const original = fixture.storage.put.bind(fixture.storage);
    vi.spyOn(fixture.storage, "put").mockImplementation(async (key, bytes) => {
      if (key.startsWith("chat-snapshot/")) {
        const source = await fixture.db.mediaAsset.findFirstOrThrow({
          where: { listingId: item.id, isCover: true },
        });
        await fixture.listings.update(item.id, owner.principal, {
          expectedVersion: 1,
          confirmConversationImpact: true,
          media: { imageIds: [replacement.id], videoId: null },
        });
        expect(
          await new MediaCleanupRepository(fixture.db).claim(source.id, owner.principal.userId),
        ).toBeNull();
      }
      return original(key, bytes);
    });
    await expect(card(row.id)).rejects.toMatchObject({ code: "SNAPSHOT_CHANGED" });
    expect(await fixture.db.message.count({ where: { conversationId: row.id } })).toBe(0);
  });

  it("rejects expired staging even before the worker runs", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const original = fixture.storage.put.bind(fixture.storage);
    vi.spyOn(fixture.storage, "put").mockImplementation(async (key, bytes) => {
      await original(key, bytes);
      if (key.startsWith("chat-snapshot/"))
        await fixture.db.listingCardSnapshot.updateMany({
          where: { conversationId: row.id },
          data: { createdAt: new Date(Date.now() - 901000) },
        });
    });
    await expect(card(row.id)).rejects.toMatchObject({ code: "SNAPSHOT_CHANGED" });
    expect(await fixture.db.transactionProposal.count({ where: { conversationId: row.id } })).toBe(
      0,
    );
  });

  it("stops expired delivery before cleanup, never resurrects on new activity, and preserves text", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const sent = await card(row.id);
    await fixture.db.conversation.update({
      where: { id: row.id },
      data: { lastActivityAt: new Date("2020-01-01Z") },
    });
    await expect(
      fixture.chat.proposals.image(owner.principal, row.id, sent.id),
    ).rejects.toMatchObject({ status: 404 });
    await fixture.chat.messages.send(owner.principal, row.id, {
      requestId: randomUUID(),
      content: "Hoạt động sau hết hạn",
    });
    const snapshot = await fixture.db.listingCardSnapshot.findUniqueOrThrow({
      where: { messageId: sent.id },
    });
    expect(snapshot.imageState).toBe("REVOKED");
    expect(snapshot.title).toBe(item.title);
    await expect(
      fixture.chat.proposals.image(owner.principal, row.id, sent.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("checks expiry again after storage stalls across the boundary", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const sent = await card(row.id);
    const actual = fixture.storage.get.bind(fixture.storage);
    let clock = new Date("2026-11-20T00:00:00Z");
    await fixture.db.listingCardSnapshot.update({
      where: { messageId: sent.id },
      data: { snapshotCreatedAt: new Date("2024-11-20T00:00:01Z") },
    });
    await fixture.db.conversation.update({
      where: { id: row.id },
      data: { lastActivityAt: clock },
    });
    vi.spyOn(ChatRepository.prototype, "now").mockImplementation(async () => clock);
    let read = false;
    vi.spyOn(fixture.storage, "get").mockImplementation(async (key) => {
      if (key.startsWith("chat-snapshot/")) {
        read = true;
        clock = new Date("2026-11-20T00:00:01Z");
      }
      return actual(key);
    });
    await expect(
      fixture.chat.proposals.image(owner.principal, row.id, sent.id),
    ).rejects.toMatchObject({ status: 404 });
    expect(read).toBe(true);
  });

  it("rechecks the staging clock after finalization waits for user locks", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const actual = fixture.storage.put.bind(fixture.storage);
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const acquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    let blocker: Promise<unknown> | undefined;
    vi.spyOn(fixture.storage, "put").mockImplementation(async (key, bytes) => {
      await actual(key, bytes);
      if (!key.startsWith("chat-snapshot/")) return;
      blocker = fixture.db.$transaction(async (tx) => {
        await lockResources(
          tx,
          [owner, contact].map((actor) => `user:${actor.principal.userId}`),
        );
        locked();
        await gate;
      });
      await acquired;
    });
    const publishing = card(row.id);
    await acquired;
    const snapshot = await fixture.db.listingCardSnapshot.findFirstOrThrow({
      where: { conversationId: row.id },
    });
    vi.spyOn(ChatRepository.prototype, "now").mockResolvedValue(
      new Date(snapshot.createdAt.getTime() + 900_000),
    );
    release();
    await blocker;
    await expect(publishing).rejects.toMatchObject({ code: "SNAPSHOT_CHANGED" });
    expect(await fixture.db.message.count({ where: { conversationId: row.id } })).toBe(0);
  });

  it("replays concurrent card retries once and rolls back a failed card insertion", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const input = {
      requestId: randomUUID(),
      kind: "NEGOTIATED_PRICE" as const,
      proposedPrice: "100000",
    };
    const cards = await Promise.all(
      Array.from({ length: 4 }, () =>
        fixture.chat.proposals.create(contact.principal, row.id, input),
      ),
    );
    expect(new Set(cards.map((message) => message.id)).size).toBe(1);
    expect(await fixture.db.transactionProposal.count({ where: { conversationId: row.id } })).toBe(
      1,
    );
    await fixture.chat.proposals.resolve(
      owner.principal,
      row.id,
      cards[0].proposal!.id,
      "REJECTED",
    );
    vi.spyOn(ChatRepository.prototype, "insertMessage").mockRejectedValueOnce(
      new Error("Fixture write failure"),
    );
    await expect(card(row.id)).rejects.toMatchObject({ status: 503 });
    expect(await fixture.db.transactionProposal.count({ where: { conversationId: row.id } })).toBe(
      1,
    );
    expect(await fixture.db.message.count({ where: { conversationId: row.id } })).toBe(1);
  });

  it("retries snapshot deletion after storage failure without losing text or resurrecting images", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const sent = await card(row.id);
    await fixture.db.conversation.update({
      where: { id: row.id },
      data: { lastActivityAt: new Date("2020-01-01Z") },
    });
    fixture.failures.deletion = true;
    await expect(fixture.chat.retention.runOnce()).rejects.toThrow("CHAT_CLEANUP_RETRY");
    expect(
      (await fixture.db.listingCardSnapshot.findUniqueOrThrow({ where: { messageId: sent.id } }))
        .imageState,
    ).toBe("REVOKED");
    fixture.failures.deletion = false;
    await fixture.chat.retention.runOnce();
    await fixture.chat.retention.runOnce();
    const snapshot = await fixture.db.listingCardSnapshot.findUniqueOrThrow({
      where: { messageId: sent.id },
    });
    expect(snapshot.imageState).toBe("DELETED");
    expect(snapshot.title).toBe(item.title);
    expect(await fixture.db.message.count({ where: { conversationId: row.id } })).toBe(1);
  });

  it("rechecks revoked sessions after acquiring the mutation locks", async () => {
    const row = await direct();
    await fixture.db.$transaction(async (tx) => {
      await lockResources(tx, [`user:${contact.principal.userId}`]);
      await fixture.db.authSession.update({
        where: { id: contact.principal.sessionId },
        data: { revokedAt: new Date() },
      });
    });
    await expect(
      fixture.chat.messages.send(contact.principal, row.id, {
        requestId: randomUUID(),
        content: "Phiên cũ",
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("cleans a snapshot writer that finishes after an expired reservation was already deleted", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const actual = fixture.storage.put.bind(fixture.storage);
    vi.spyOn(fixture.storage, "put").mockImplementation(async (key, bytes) => {
      if (key.startsWith("chat-snapshot/")) {
        await fixture.db.listingCardSnapshot.updateMany({
          where: { conversationId: row.id },
          data: { createdAt: new Date(Date.now() - 901_000) },
        });
        await fixture.chat.retention.runOnce();
        expect(
          (
            await fixture.db.listingCardSnapshot.findFirstOrThrow({
              where: { conversationId: row.id },
            })
          ).imageState,
        ).toBe("DELETED");
      }
      await actual(key, bytes);
    });
    await expect(card(row.id)).rejects.toMatchObject({ code: "SNAPSHOT_CHANGED" });
    const snapshot = await fixture.db.listingCardSnapshot.findFirstOrThrow({
      where: { conversationId: row.id },
    });
    expect(snapshot.imageState).toBe("REVOKED");
    expect(snapshot.imageDeletedAt).toBeNull();
    await fixture.chat.retention.runOnce();
    await fixture.chat.retention.runOnce();
    expect(fixture.objects.has(snapshot.imageStorageKey)).toBe(false);
  });

  it("requires a non-null positive reservation version in PostgreSQL", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const source = await fixture.db.mediaAsset.findFirstOrThrow({
      where: { listingId: item.id, isCover: true },
    });
    for (const sourceListingVersion of [null, 0]) {
      await expect(
        fixture.db.listingCardSnapshot.create({
          data: {
            conversationId: row.id,
            listingId: item.id,
            title: item.title,
            type: "SALE",
            listedPrice: "100",
            imageStorageKey: `chat-snapshot/${randomUUID()}.webp`,
            sourceMediaId: source.id,
            sourceListingVersion,
          },
        }),
      ).rejects.toBeDefined();
    }
  });

  it("fences stale snapshot cleanup completion and reconciles local crash leftovers", async () => {
    const item = await listing();
    const row = await fixture.chat.conversations.create(contact.principal, {
      type: "LISTING",
      listingId: item.id,
    });
    const sent = await card(row.id);
    await fixture.db.conversation.update({
      where: { id: row.id },
      data: { lastActivityAt: new Date("2020-01-01Z") },
    });
    const snapshot = await fixture.db.listingCardSnapshot.findUniqueOrThrow({
      where: { messageId: sent.id },
    });
    const actual = fixture.storage.delete.bind(fixture.storage);
    let delayed = false;
    vi.spyOn(fixture.storage, "delete").mockImplementation(async (key) => {
      await actual(key);
      if (key === snapshot.imageStorageKey && !delayed) {
        delayed = true;
        fixture.objects.set(key, Buffer.from("late writer"));
        await fixture.db.listingCardSnapshot.update({
          where: { id: snapshot.id },
          data: { imageRevokedAt: new Date() },
        });
      }
    });
    await fixture.chat.retention.runOnce();
    expect(
      (await fixture.db.listingCardSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } }))
        .imageState,
    ).toBe("REVOKED");
    await fixture.chat.retention.runOnce();
    await fixture.chat.retention.runOnce();
    expect(
      (await fixture.db.listingCardSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } }))
        .imageState,
    ).toBe("DELETED");
    fixture.objects.set(snapshot.imageStorageKey, Buffer.from("crash leftover"));
    fixture.storage.listManaged = async function* () {
      yield { key: snapshot.imageStorageKey, modifiedAt: new Date(Date.now() - 18 * 60_000) };
    };
    await fixture.chat.retention.runOnce();
    expect(fixture.objects.has(snapshot.imageStorageKey)).toBe(false);
    expect(
      await fixture.db.mediaAsset.count({ where: { listingId: item.id, status: "ATTACHED" } }),
    ).toBe(1);
  });
});
