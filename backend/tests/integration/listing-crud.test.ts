import { randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAuthFixture, type AuthFixture } from "../helpers/auth-fixture";
import { MediaCleanupService } from "../../src/modules/media/media-cleanup.service";
import { MediaCleanupRepository } from "../../src/modules/media/media-cleanup.repository";
import { ListingMediaService } from "../../src/modules/media/listing-media.service";
import { ListingMediaRepository } from "../../src/modules/media/listing-media.repository";
import { lockResources } from "../../src/shared/database/locks";
import type { Principal } from "../../src/modules/auth";
import { listingContract } from "../helpers/listing-contract";
import { jpegWithFtypAppSegment } from "../helpers/listing-image-fixture";

let fixture: AuthFixture;
let actor: { token: string; principal: Principal };
let provinceCode: string;
let image: Buffer;
beforeEach(async () => {
  fixture = await createAuthFixture();
  actor = await identity();
  provinceCode = (await fixture.province()).code;
  image = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#239acb" } })
    .png()
    .toBuffer();
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (fixture) await fixture.dispose();
});

/** Tạo phiên thật mà không lặp luồng OTP/login không liên quan trong mọi test Listing. */
async function identity() {
  const user = await fixture.user();
  const session = await fixture.db.$transaction((tx) => fixture.sessions.create(user, tx));
  return {
    token: session.accessToken,
    principal: await fixture.sessions.authenticate(session.accessToken),
  };
}
/** Dùng route upload HTTP, decoder, vòng đời và metadata database đã commit thực tế. */
async function upload(as = actor): Promise<string> {
  const response = await request(fixture.app)
    .post("/api/media/listing-uploads")
    .auth(as.token, { type: "bearer" })
    .set("Content-Type", "application/octet-stream")
    .send(image)
    .expect(201);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.body).toMatchObject({
    type: "IMAGE",
    status: "TEMP",
    mimeType: "image/webp",
    durationSeconds: null,
  });
  expect(listingContract("ListingUpload").safeParse(response.body).success).toBe(true);
  expect(JSON.stringify(response.body)).not.toMatch(/storageKey|listing\/v1/);
  return z.object({ id: z.uuid() }).parse(response.body).id;
}
/** Tạo request contract đầy đủ với Province độc lập hồ sơ chủ sở hữu. */
function input(ids: string[]) {
  return {
    title: "  Xe đạp thành phố đẹp  ",
    description: "Xe còn tốt, xem và nhận tại địa điểm đã hẹn.",
    type: "SALE" as const,
    price: "999999999999999",
    rentalUnit: null,
    provinceCode,
    media: { imageIds: ids, videoId: null },
  };
}
/** Tạo Listing thật qua contract HTTP đã mount. */
async function create(ids?: string[]) {
  const response = await request(fixture.app)
    .post("/api/listings")
    .auth(actor.token, { type: "bearer" })
    .send(input(ids ?? [await upload()]))
    .expect(201);
  expect(listingContract("ListingDetail").safeParse(response.body).success).toBe(true);
  return z
    .object({ id: z.uuid(), version: z.number(), activeCycle: z.number() })
    .parse(response.body);
}
/** Gửi PATCH được bảo vệ, giữ assertion tại nơi gọi. */
function patch(id: string, body: object, as = actor) {
  return request(fixture.app)
    .patch(`/api/listings/${id}`)
    .auth(as.token, { type: "bearer" })
    .send(body);
}
/** Nạp hàng hiện tại có kiểu để kiểm tra bất biến mà riêng HTTP không chứng minh được. */
function row(id: string) {
  return fixture.db.listing.findUniqueOrThrow({
    where: { id },
    include: { province: true, media: { orderBy: { position: "asc" } } },
  });
}

describe("Listing CRUD HTTP with real PostgreSQL", () => {
  it("reports path validation before an invalid patch body", async () => {
    const response = await patch("invalid-id", {}).expect(400);
    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: [{ path: "params.listingId", code: "invalid_format" }],
    });
  });

  it("uploads and delivers a valid JPEG even when its APP metadata contains the video sniff marker", async () => {
    image = await jpegWithFtypAppSegment();
    const mediaId = await upload();
    const listing = await create([mediaId]);
    for (const variant of ["detail", "thumbnail"]) {
      const response = await request(fixture.app)
        .get(`/api/listings/${listing.id}/media/${mediaId}`)
        .query({ variant })
        .expect(200);
      expect(response.headers["content-type"]).toMatch(/^image\/webp/);
      expect((await sharp(response.body).metadata()).format).toBe("webp");
    }
  });
  it("creates exact-price SALE, RENT and EXCHANGE, with canonical title and no private data", async () => {
    for (const terms of [
      { type: "SALE", price: "999999999999999", rentalUnit: null },
      { type: "RENT", price: "100", rentalUnit: "DAY" },
      { type: "EXCHANGE", price: null, rentalUnit: null },
    ]) {
      const mediaId = await upload();
      const response = await request(fixture.app)
        .post("/api/listings")
        .auth(actor.token, { type: "bearer" })
        .send({ ...input([mediaId]), ...terms })
        .expect(201);
      const id = z.object({ id: z.uuid() }).parse(response.body).id;
      expect(response.headers.location).toBe(`/api/listings/${id}`);
      expect(response.body).toMatchObject({
        ...terms,
        title: "Xe đạp thành phố đẹp",
        contactPhone: null,
        version: 1,
        activeCycle: 1,
        status: "ACTIVE",
        province: { code: provinceCode },
        cover: { id: mediaId, isCover: true },
      });
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toMatch(
        /storageKey|passwordHash|refreshToken|emailVerifiedAt|deletionRequestedAt/,
      );
      expect((await row(id)).searchTitle).toBe("xe dap thanh pho dep");
      await request(fixture.app).get(`/api/listings/${id}`).expect(200);
      const bytes = await request(fixture.app)
        .get(`/api/listings/${id}/media/${mediaId}`)
        .expect(200);
      expect(bytes.headers["content-type"]).toMatch(/^image\/webp/);
      expect(bytes.headers["cache-control"]).toBe("no-store");
      expect((await sharp(bytes.body).metadata()).width).toBe(800);
    }
  });

  it("rejects unauthenticated writes, invalid optional bearer, mass assignment and invalid province", async () => {
    await request(fixture.app)
      .post("/api/listings")
      .send(input([randomUUID()]))
      .expect(401);
    const listing = await create();
    await request(fixture.app)
      .get(`/api/listings/${listing.id}`)
      .set("Authorization", "Bearer invalid")
      .expect(401);
    for (const invalid of [
      { ownerId: randomUUID() },
      { version: 8 },
      { activeCycle: 2 },
      { status: "HIDDEN" },
      { price: 123 },
      { price: "1e10" },
      { price: "0" },
      { type: "RENT", rentalUnit: null },
      { type: "EXCHANGE" },
      { provinceCode: "unknown" },
    ])
      await request(fixture.app)
        .post("/api/listings")
        .auth(actor.token, { type: "bearer" })
        .send({ ...input([randomUUID()]), ...invalid })
        .expect(400);
    expect(await fixture.db.listing.count({ where: { ownerId: actor.principal.userId } })).toBe(1);
  });

  it("rolls back the entire create and first attachment when a later image is not ready", async () => {
    const first = await upload();
    const lifecycle = new ListingMediaService(
      new ListingMediaRepository(fixture.db),
      fixture.storage,
    );
    const second = await lifecycle.reserve(actor.principal.userId, 6);
    const response = await request(fixture.app)
      .post("/api/listings")
      .auth(actor.token, { type: "bearer" })
      .send(input([first, second.id]))
      .expect(409);
    expect(response.body.error.code).toBe("MEDIA_NOT_READY");
    expect(await fixture.db.listing.count({ where: { ownerId: actor.principal.userId } })).toBe(0);
    expect(
      await fixture.db.mediaAsset.findMany({
        where: { id: { in: [first, second.id] } },
        select: { status: true, listingId: true },
      }),
    ).toEqual([
      { status: "TEMP", listingId: null },
      { status: "TEMP", listingId: null },
    ]);
    expect(fixture.deletedKeys).toEqual([]);
  });

  it("rejects foreign, expired and duplicate assets without consuming valid uploads", async () => {
    const own = await upload();
    const foreign = await upload(await identity());
    const expired = await upload();
    await fixture.db.mediaAsset.update({
      where: { id: expired },
      data: { expiresAt: new Date(0) },
    });
    for (const [ids, status] of [
      [[own, foreign], 404],
      [[own, expired], 409],
      [[own, own.toUpperCase()], 400],
    ] as const)
      await request(fixture.app)
        .post("/api/listings")
        .auth(actor.token, { type: "bearer" })
        .send(input([...ids]))
        .expect(status);
    expect((await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: own } })).status).toBe(
      "TEMP",
    );
  });

  it("allows only one of two creates racing to consume the same upload", async () => {
    const mediaId = await upload();
    const results = await Promise.all([
      request(fixture.app)
        .post("/api/listings")
        .auth(actor.token, { type: "bearer" })
        .send(input([mediaId])),
      request(fixture.app)
        .post("/api/listings")
        .auth(actor.token, { type: "bearer" })
        .send(input([mediaId])),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await fixture.db.listing.count({ where: { ownerId: actor.principal.userId } })).toBe(1);
  });

  it("updates once, rejects missing/malformed/stale versions, and serializes competing edits", async () => {
    const listing = await create();
    const before = await row(listing.id);
    for (const body of [
      { title: "Another valid title" },
      { expectedVersion: "1", title: "Another valid title" },
    ])
      await patch(listing.id, body).expect(400);
    const responses = await Promise.all([
      patch(listing.id, { expectedVersion: 1, title: "First concurrent title" }),
      patch(listing.id, { expectedVersion: 1, title: "Second concurrent title" }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409)?.body.error.code).toBe(
      "LISTING_VERSION_CONFLICT",
    );
    const after = await row(listing.id);
    expect(after.version).toBe(2);
    expect(after.createdAt).toEqual(before.createdAt);
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    expect(
      await fixture.db.outboxEvent.count({
        where: { aggregateId: listing.id, eventType: "listing.updated" },
      }),
    ).toBe(1);
    await patch(listing.id, { expectedVersion: 2, type: "EXCHANGE" }).expect(400);
    await patch(listing.id, {
      expectedVersion: 2,
      type: "EXCHANGE",
      price: null,
      rentalUnit: null,
    }).expect(200);
    expect((await row(listing.id)).version).toBe(3);
  });

  it("applies a full manifest atomically, preserves cover on reorder and falls back when removed", async () => {
    const a = await upload();
    const b = await upload();
    const c = await upload();
    const listing = await create([a, b]);
    const first = await patch(listing.id, {
      expectedVersion: 1,
      media: { imageIds: [b, a], videoId: null },
    }).expect(200);
    expect(first.body.cover.id).toBe(a);
    expect(first.body.media.map((asset: { id: string }) => asset.id)).toEqual([b, a]);
    const replacement = await patch(listing.id, {
      expectedVersion: 2,
      media: { imageIds: [b, c], videoId: null },
    }).expect(200);
    expect(replacement.body.cover.id).toBe(b);
    const removed = await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: a } });
    expect(removed).toMatchObject({
      status: "DELETING",
      listingId: null,
      position: null,
      isCover: false,
      deletedAt: null,
    });
    expect(fixture.deletedKeys).toEqual([]);
    const cleanup = new MediaCleanupService(
      new MediaCleanupRepository(fixture.db),
      fixture.storage,
    );
    await cleanup.detached(a, actor.principal.userId);
    expect(fixture.objects.has(removed.storageKey)).toBe(false);
    expect((await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: b } })).status).toBe(
      "ATTACHED",
    );
    await patch(listing.id, {
      expectedVersion: 3,
      media: { imageIds: [c, b], videoId: null, coverImageId: c },
    }).expect(200);
    expect((await row(listing.id)).media.find((asset) => asset.isCover)?.id).toBe(c);
  });

  it("rolls back old cover/detachment, new attachments, content and outbox on replacement failure", async () => {
    const old = await upload();
    const fresh = await upload();
    const listing = await create([old]);
    const lifecycle = new ListingMediaService(
      new ListingMediaRepository(fixture.db),
      fixture.storage,
    );
    const unready = await lifecycle.reserve(actor.principal.userId, 6);
    await patch(listing.id, {
      expectedVersion: 1,
      title: "Changed but rolled back",
      media: { imageIds: [fresh, unready.id], videoId: null },
    }).expect(409);
    const current = await row(listing.id);
    expect(current).toMatchObject({ version: 1, title: "Xe đạp thành phố đẹp" });
    expect(current.media).toHaveLength(1);
    expect(current.media[0]).toMatchObject({ id: old, status: "ATTACHED", isCover: true });
    expect((await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: fresh } })).status).toBe(
      "TEMP",
    );
    expect(
      await fixture.db.outboxEvent.count({
        where: { OR: [{ aggregateId: listing.id }, { aggregateId: actor.principal.userId }] },
      }),
    ).toBe(0);
    expect(fixture.deletedKeys).toEqual([]);
  });

  it("enforces owner visibility, bidirectional Block, lifecycle and private delivery", async () => {
    const mediaId = await upload();
    const listing = await create([mediaId]);
    const peer = await identity();
    await patch(listing.id, { expectedVersion: 1, title: "Unauthorized replacement" }, peer).expect(
      404,
    );
    await request(fixture.app).get(`/api/listings/${listing.id}/media/${randomUUID()}`).expect(404);
    await fixture.db.userBlock.create({
      data: { blockerId: actor.principal.userId, blockedId: peer.principal.userId },
    });
    await request(fixture.app)
      .get(`/api/listings/${listing.id}`)
      .auth(peer.token, { type: "bearer" })
      .expect(404);
    await request(fixture.app)
      .get(`/api/listings/${listing.id}/media/${mediaId}`)
      .auth(peer.token, { type: "bearer" })
      .expect(404);
    await request(fixture.app).get(`/api/listings/${listing.id}`).expect(200);
    await fixture.db.userBlock.deleteMany({ where: { blockerId: actor.principal.userId } });
    await fixture.db.userBlock.create({
      data: { blockerId: peer.principal.userId, blockedId: actor.principal.userId },
    });
    await request(fixture.app)
      .get(`/api/listings/${listing.id}`)
      .auth(peer.token, { type: "bearer" })
      .expect(404);
    await fixture.db.user.update({
      where: { id: actor.principal.userId },
      data: { status: "PENDING_DELETION", deletionRequestedAt: new Date() },
    });
    await request(fixture.app).get(`/api/listings/${listing.id}`).expect(404);
    await patch(listing.id, { expectedVersion: 1, title: "Pending account mutation" }).expect(403);
    await request(fixture.app)
      .get("/api/users/me/listings")
      .auth(actor.token, { type: "bearer" })
      .expect(403);
    expect((await row(listing.id)).status).toBe("ACTIVE");
  });

  it("hides/reopens with no-op version rules, soft-deletes terminally and supports tombstone retry", async () => {
    const mediaId = await upload();
    const listing = await create([mediaId]);
    const visibility = (body: object) =>
      request(fixture.app)
        .patch(`/api/listings/${listing.id}/visibility`)
        .auth(actor.token, { type: "bearer" })
        .send(body);
    const hidden = await visibility({ status: "HIDDEN", expectedVersion: 1 }).expect(200);
    expect(hidden.body).toMatchObject({ version: 2, activeCycle: 1 });
    await request(fixture.app).get(`/api/listings/${listing.id}`).expect(404);
    await request(fixture.app).get(`/api/listings/${listing.id}/media/${mediaId}`).expect(404);
    await request(fixture.app)
      .get(`/api/listings/${listing.id}`)
      .auth(actor.token, { type: "bearer" })
      .expect(200);
    await request(fixture.app)
      .get(`/api/listings/${listing.id}/media/${mediaId}`)
      .auth(actor.token, { type: "bearer" })
      .expect(200);
    const noop = await visibility({ status: "HIDDEN", expectedVersion: 2 }).expect(200);
    expect(noop.body.version).toBe(2);
    const reopened = await visibility({ status: "ACTIVE", expectedVersion: 2 }).expect(200);
    expect(reopened.body).toMatchObject({ version: 3, activeCycle: 2 });
    const remove = (body: object) =>
      request(fixture.app)
        .delete(`/api/listings/${listing.id}`)
        .auth(actor.token, { type: "bearer" })
        .send(body);
    await remove({ expectedVersion: 3, confirmDelete: false }).expect(400);
    await remove({ expectedVersion: 3, confirmDelete: true }).expect(204);
    expect(await row(listing.id)).toMatchObject({
      status: "DELETED",
      version: 4,
      deletedAt: expect.any(Date),
    });
    await remove({ expectedVersion: 3, confirmDelete: true }).expect(409);
    await remove({ expectedVersion: 4, confirmDelete: true }).expect(204);
    await visibility({ status: "ACTIVE", expectedVersion: 4 }).expect(404);
    await patch(listing.id, { expectedVersion: 4, title: "Cannot resurrect listing" }).expect(404);
    await request(fixture.app)
      .get(`/api/listings/${listing.id}`)
      .auth(actor.token, { type: "bearer" })
      .expect(404);
    await request(fixture.app)
      .get(`/api/listings/${listing.id}/media/${mediaId}`)
      .auth(actor.token, { type: "bearer" })
      .expect(404);
    expect((await row(listing.id)).media[0]?.status).toBe("ATTACHED");
    expect(fixture.deletedKeys).toEqual([]);
  });

  it("paginates own ACTIVE/HIDDEN records with equal timestamps and validates cursor bindings", async () => {
    const a = await create();
    const b = await create();
    const c = await create();
    const createdAt = new Date(Date.now() - 1000);
    await fixture.db.listing.updateMany({
      where: { ownerId: actor.principal.userId },
      data: { createdAt },
    });
    await fixture.listings.visibility(b.id, actor.principal, {
      expectedVersion: 1,
      status: "HIDDEN",
    });
    const first = await request(fixture.app)
      .get("/api/users/me/listings?limit=2")
      .auth(actor.token, { type: "bearer" })
      .expect(200);
    expect(listingContract("ListingPage").safeParse(first.body).success).toBe(true);
    const cursor = z.object({ pagination: z.object({ nextCursor: z.string() }) }).parse(first.body)
      .pagination.nextCursor;
    const next = await request(fixture.app)
      .get("/api/users/me/listings")
      .query({ limit: 2, after: cursor })
      .auth(actor.token, { type: "bearer" })
      .expect(200);
    expect([...first.body.data, ...next.body.data].map((item: { id: string }) => item.id)).toEqual(
      [a.id, b.id, c.id].sort().reverse(),
    );
    expect(next.body.pagination.nextCursor).toBeNull();
    await request(fixture.app)
      .get("/api/users/me/listings")
      .query({ limit: 1, after: cursor })
      .auth(actor.token, { type: "bearer" })
      .expect(400);
    const peer = await identity();
    await request(fixture.app)
      .get("/api/users/me/listings")
      .query({ limit: 2, after: cursor })
      .auth(peer.token, { type: "bearer" })
      .expect(400);
    await request(fixture.app)
      .get("/api/users/me/listings?after=bad")
      .auth(actor.token, { type: "bearer" })
      .expect(400);
    const hidden = await request(fixture.app)
      .get("/api/users/me/listings?status=HIDDEN")
      .auth(actor.token, { type: "bearer" })
      .expect(200);
    expect(hidden.body.data.map((item: { id: string }) => item.id)).toEqual([b.id]);
  });

  it("requires Conversation confirmation, locks type and preserves accepted history across reopen/delete", async () => {
    const listing = await create();
    const peer = await identity();
    const conversation = await fixture.db.conversation.create({
      data: {
        type: "LISTING",
        listingId: listing.id,
        initiatorId: peer.principal.userId,
        contactUserId: peer.principal.userId,
      },
    });
    const missing = await patch(listing.id, {
      expectedVersion: 1,
      title: "Confirmed content replacement",
    }).expect(409);
    expect(missing.body.error.code).toBe("LISTING_CONFIRMATION_REQUIRED");
    const locked = await patch(listing.id, {
      expectedVersion: 1,
      type: "EXCHANGE",
      price: null,
      confirmConversationImpact: true,
    }).expect(409);
    expect(locked.body.error.code).toBe("LISTING_TYPE_LOCKED");
    await patch(listing.id, {
      expectedVersion: 1,
      price: "100",
      confirmConversationImpact: true,
    }).expect(200);
    const proposal = await fixture.db.transactionProposal.create({
      data: {
        conversationId: conversation.id,
        listingId: listing.id,
        proposerId: peer.principal.userId,
        type: "SALE",
        proposalKind: "LISTED_PRICE",
        status: "ACCEPTED",
        listedPriceSnapshot: "999999999999999",
        proposedPrice: "999999999999999",
        createdCycle: 1,
        acceptedCycle: 1,
        resolvedAt: new Date(),
      },
    });
    await fixture.listings.visibility(listing.id, actor.principal, {
      expectedVersion: 2,
      status: "HIDDEN",
    });
    await patch(listing.id, {
      expectedVersion: 3,
      price: "200",
      confirmConversationImpact: true,
    }).expect(409);
    await expect(
      fixture.listings.visibility(listing.id, actor.principal, {
        expectedVersion: 3,
        status: "ACTIVE",
      }),
    ).rejects.toMatchObject({ code: "LISTING_CONFIRMATION_REQUIRED" });
    const reopened = await fixture.listings.visibility(listing.id, actor.principal, {
      expectedVersion: 3,
      status: "ACTIVE",
      confirmReopenAfterAccepted: true,
    });
    expect(reopened).toMatchObject({ version: 4, activeCycle: 2 });
    await fixture.listings.remove(listing.id, actor.principal, 4);
    expect(await fixture.db.conversation.count({ where: { id: conversation.id } })).toBe(1);
    expect(
      (
        await fixture.db.transactionProposal.findUniqueOrThrow({ where: { id: proposal.id } })
      ).proposedPrice?.toFixed(0),
    ).toBe("999999999999999");
  });

  it("serializes manifest replacement with stale cleanup jobs and cancellation", async () => {
    const old = await upload();
    const fresh = await upload();
    const listing = await create([old]);
    const cleanup = new MediaCleanupService(
      new MediaCleanupRepository(fixture.db),
      fixture.storage,
    );
    const results = await Promise.all([
      patch(listing.id, { expectedVersion: 1, media: { imageIds: [fresh], videoId: null } }),
      cleanup.detached(old, actor.principal.userId),
    ]);
    expect(results[0].status).toBe(200);
    await cleanup.detached(old, actor.principal.userId);
    const retained = await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: fresh } });
    expect(fixture.objects.has(retained.storageKey)).toBe(true);
    await cleanup.detached(fresh, actor.principal.userId);
    expect(fixture.objects.has(retained.storageKey)).toBe(true);
    const another = await upload();
    const race = await Promise.all([
      patch(listing.id, { expectedVersion: 2, media: { imageIds: [another], videoId: null } }),
      request(fixture.app)
        .delete(`/api/media/listing-uploads/${another}`)
        .auth(actor.token, { type: "bearer" }),
    ]);
    expect(race.map((response) => response.status)).toSatisfy(
      (statuses: number[]) =>
        (statuses[0] === 200 && statuses[1] === 409) ||
        (statuses[0] === 409 && statuses[1] === 204),
    );
  });

  it("rereads Conversation existence and session after waiting on User/Listing locks", async () => {
    const listing = await create();
    const peer = await identity();
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const holder = fixture.db.$transaction(async (tx) => {
      await lockResources(tx, [`user:${actor.principal.userId}`, `user:${peer.principal.userId}`]);
      await lockResources(tx, [`listing:${listing.id}`]);
      await tx.conversation.create({
        data: {
          type: "LISTING",
          listingId: listing.id,
          initiatorId: peer.principal.userId,
          contactUserId: peer.principal.userId,
        },
      });
      locked();
      await gate;
    });
    await ready;
    const editing = fixture.listings.update(listing.id, actor.principal, {
      expectedVersion: 1,
      type: "EXCHANGE",
      price: null,
      rentalUnit: null,
      confirmConversationImpact: true,
    });
    release();
    await holder;
    await expect(editing).rejects.toMatchObject({ code: "LISTING_TYPE_LOCKED" });
    await fixture.db.authSession.update({
      where: { id: actor.principal.sessionId },
      data: { revokedAt: new Date() },
    });
    await expect(fixture.listings.remove(listing.id, actor.principal, 1)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects invalid bytes, oversized images and malformed video without reserving metadata", async () => {
    const send = (bytes: Buffer) =>
      request(fixture.app)
        .post("/api/media/listing-uploads")
        .auth(actor.token, { type: "bearer" })
        .set("Content-Type", "application/octet-stream")
        .send(bytes);
    await send(Buffer.from("not a real image")).expect(415);
    await send(Buffer.alloc(10 * 1024 * 1024 + 1)).expect(413);
    await send(Buffer.from([0, 0, 0, 20, 102, 116, 121, 112])).expect(415);
    await request(fixture.app)
      .post("/api/media/listing-uploads")
      .auth(actor.token, { type: "bearer" })
      .send({ storageKey: "private" })
      .expect(415);
    expect(
      await fixture.db.mediaAsset.count({ where: { uploadedById: actor.principal.userId } }),
    ).toBe(0);
  });

  it("handles five images, cover at any position, retained video and removal without freeing live references", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 5; index++) ids.push(await upload());
    const listing = await create(ids);
    const extra = await upload();
    await patch(listing.id, {
      expectedVersion: 1,
      media: { imageIds: [...ids, extra], videoId: null },
    }).expect(400);
    await patch(listing.id, { expectedVersion: 1, media: { imageIds: [], videoId: null } }).expect(
      400,
    );
    const video = await fixture.db.mediaAsset.create({
      data: {
        uploadedById: actor.principal.userId,
        purpose: "LISTING",
        type: "VIDEO",
        status: "ATTACHED",
        listingId: listing.id,
        storageKey: `listing/${randomUUID()}.mp4`,
        mimeType: "video/mp4",
        sizeBytes: 100 * 1024 * 1024,
        durationSeconds: 180,
      },
    });
    const retained = await patch(listing.id, {
      expectedVersion: 1,
      media: { imageIds: ids, videoId: video.id, coverImageId: ids[4] },
    }).expect(200);
    expect(retained.body.cover.id).toBe(ids[4]);
    expect(listingContract("ListingDetail").safeParse(retained.body).success).toBe(true);
    await patch(listing.id, {
      expectedVersion: 2,
      media: { imageIds: ids, videoId: video.id, coverImageId: video.id },
    }).expect(400);
    await request(fixture.app)
      .get(`/api/listings/${listing.id}/media/${ids[0]}?variant=original`)
      .expect(400);
    await request(fixture.app)
      .get(`/api/listings/${listing.id}/media/${ids[0]}`)
      .set("Range", "bytes=0-1")
      .expect(416);
    await request(fixture.app).get(`/api/listings/${listing.id}/media/${video.id}`).expect(503);
    for (const variant of ["detail", "thumbnail"])
      await request(fixture.app)
        .get(`/api/listings/${listing.id}/media/${ids[0]}`)
        .query({ variant })
        .expect(200)
        .expect("Content-Type", /image\/webp/);
    const peer = await identity();
    const conversation = await fixture.db.conversation.create({
      data: {
        type: "LISTING",
        listingId: listing.id,
        initiatorId: peer.principal.userId,
        contactUserId: peer.principal.userId,
      },
    });
    await fixture.db.message.create({
      data: {
        conversationId: conversation.id,
        senderId: peer.principal.userId,
        requestId: randomUUID(),
        type: "TEXT",
        imageMediaId: ids[0],
        payloadHash: "fixture",
      },
    });
    const guarded = await patch(listing.id, {
      expectedVersion: 2,
      confirmConversationImpact: true,
      media: { imageIds: ids.slice(1), videoId: null },
    }).expect(409);
    expect(guarded.body.error.code).toBe("MEDIA_REFERENCE_CONFLICT");
    expect((await row(listing.id)).version).toBe(2);
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: video.id } })).listingId,
    ).toBe(listing.id);
    await fixture.db.message.deleteMany({ where: { conversationId: conversation.id } });
    await patch(listing.id, {
      expectedVersion: 2,
      confirmConversationImpact: true,
      media: { imageIds: ids, videoId: null },
    }).expect(200);
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: video.id } })).listingId,
    ).toBeNull();
    const cleanup = new MediaCleanupService(
      new MediaCleanupRepository(fixture.db),
      fixture.storage,
    );
    await cleanup.detached(video.id, actor.principal.userId);
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: video.id } })).deletedAt,
    ).not.toBeNull();
  });

  it("validates inactive province on edit while leaving the existing province independent of profile", async () => {
    const listing = await create();
    const other = await fixture.province();
    await fixture.db.province.update({ where: { id: other.id }, data: { isActive: false } });
    await patch(listing.id, { expectedVersion: 1, provinceCode: other.code }).expect(400);
    await fixture.db.user.update({
      where: { id: actor.principal.userId },
      data: { provinceId: other.id },
    });
    await patch(listing.id, { expectedVersion: 1, contactPhone: "+84912345678" }).expect(200);
    const current = await row(listing.id);
    expect(current.province.code).toBe(provinceCode);
    expect(current.contactPhone).toBe("+84912345678");
  });

  it("rolls back attachments when persistence fails after the media write phase", async () => {
    const old = await upload();
    const fresh = await upload();
    const listing = await create([old]);
    // Trigger PostgreSQL thật làm UPDATE Listing cuối thất bại sau khi thao tác Media đã chạy.
    const functionName = `test_listing_failure_${randomUUID().replaceAll("-", "")}`;
    await fixture.db.$executeRawUnsafe(
      `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${listing.id}'::uuid THEN RAISE EXCEPTION 'fixture listing failure'; END IF; RETURN NEW; END $$`,
    );
    await fixture.db.$executeRawUnsafe(
      `CREATE TRIGGER ${functionName} BEFORE UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
    );
    try {
      const result = await patch(listing.id, {
        expectedVersion: 1,
        media: { imageIds: [fresh], videoId: null },
      }).expect(500);
      expect(JSON.stringify(result.body)).not.toContain("fixture listing failure");
      expect((await row(listing.id)).media[0]).toMatchObject({
        id: old,
        isCover: true,
        status: "ATTACHED",
      });
      expect((await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: fresh } })).status).toBe(
        "TEMP",
      );
      expect(
        await fixture.db.outboxEvent.count({ where: { aggregateId: actor.principal.userId } }),
      ).toBe(0);
      expect(fixture.deletedKeys).toEqual([]);
    } finally {
      await fixture.db.$executeRawUnsafe(`DROP TRIGGER ${functionName} ON listings`);
      await fixture.db.$executeRawUnsafe(`DROP FUNCTION ${functionName}()`);
    }
  });

  it("cancels TEMP idempotently through HTTP and rejects foreign or attached cancellation", async () => {
    const id = await upload();
    const peer = await identity();
    await request(fixture.app)
      .delete(`/api/media/listing-uploads/${id}`)
      .auth(peer.token, { type: "bearer" })
      .expect(404);
    for (let retry = 0; retry < 2; retry++)
      await request(fixture.app)
        .delete(`/api/media/listing-uploads/${id}`)
        .auth(actor.token, { type: "bearer" })
        .expect(204);
    expect(
      await fixture.db.outboxEvent.count({
        where: { aggregateId: actor.principal.userId, eventType: "media.cleanup" },
      }),
    ).toBe(1);
    const attached = await upload();
    await create([attached]);
    await request(fixture.app)
      .delete(`/api/media/listing-uploads/${attached}`)
      .auth(actor.token, { type: "bearer" })
      .expect(409);
    await request(fixture.app).get(`/api/listings/${randomUUID()}/media/${id}`).expect(404);
  });

  it("checks media uploader on delivery and maps private storage failures safely", async () => {
    const mediaId = await upload();
    const listing = await create([mediaId]);
    const peer = await identity();
    await fixture.db.mediaAsset.update({
      where: { id: mediaId },
      data: { uploadedById: peer.principal.userId },
    });
    await request(fixture.app).get(`/api/listings/${listing.id}/media/${mediaId}`).expect(404);
    await fixture.db.mediaAsset.update({
      where: { id: mediaId },
      data: { uploadedById: actor.principal.userId },
    });
    const storage = vi
      .spyOn(fixture.storage, "get")
      .mockRejectedValueOnce(new Error("Private storage credential and key"));
    const failure = await request(fixture.app)
      .get(`/api/listings/${listing.id}/media/${mediaId}`)
      .expect(503);
    expect(failure.body.error.code).toBe("MEDIA_UNAVAILABLE");
    expect(JSON.stringify(failure.body)).not.toContain("credential");
    storage.mockRestore();
  });

  it("deletes a CRUD-created account gallery safely while retaining another user's avatar and media", async () => {
    const mediaId = await upload();
    const listing = await create([mediaId]);
    const peer = await identity();
    const peerMedia = await upload(peer);
    await fixture.avatars.upload(peer.principal, image);
    const avatar = (
      await fixture.db.user.findUniqueOrThrow({ where: { id: peer.principal.userId } })
    ).avatarMediaId;
    if (!avatar) throw new Error("Missing fixture avatar");
    const avatarKey = (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: avatar } }))
      .storageKey;
    const requestedAt = new Date(Date.now() - 31 * 86400000);
    await fixture.db.user.update({
      where: { id: actor.principal.userId },
      data: { status: "PENDING_DELETION", deletionRequestedAt: requestedAt },
    });
    await fixture.db.outboxEvent.create({
      data: {
        aggregateId: actor.principal.userId,
        aggregateType: "User",
        eventType: "account.delete",
        payload: { requestedAt: requestedAt.toISOString() },
      },
    });
    await fixture.cleanup.runOnce();
    expect(
      (await fixture.db.user.findUniqueOrThrow({ where: { id: actor.principal.userId } })).status,
    ).toBe("DELETED");
    expect((await row(listing.id)).status).toBe("DELETED");
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } })).deletedAt,
    ).not.toBeNull();
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: peerMedia } })).status,
    ).toBe("TEMP");
    expect(fixture.objects.has(avatarKey)).toBe(true);
    expect(
      (await fixture.db.user.findUniqueOrThrow({ where: { id: peer.principal.userId } }))
        .avatarMediaId,
    ).toBe(avatar);
  });
});
