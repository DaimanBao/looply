import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthFixture, type AuthFixture } from "../helpers/auth-fixture";
import { MediaCleanupRepository } from "../../src/modules/media/media-cleanup.repository";
import { MediaCleanupService } from "../../src/modules/media/media-cleanup.service";
import { ListingMediaRepository } from "../../src/modules/media/listing-media.repository";
import { ListingMediaService } from "../../src/modules/media/listing-media.service";
import { lockResources } from "../../src/shared/database/locks";
import { MediaOrphanRecovery } from "../../src/modules/media/media-orphan-recovery.service";
import request from "supertest";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { S3ObjectStore } from "../../src/modules/media/object-store";

let fixture: AuthFixture;
let cleanup: MediaCleanupService;
let repository: MediaCleanupRepository;
let listingMedia: ListingMediaService;
beforeEach(async () => {
  fixture = await createAuthFixture();
  repository = new MediaCleanupRepository(fixture.db);
  cleanup = new MediaCleanupService(repository, fixture.storage);
  listingMedia = new ListingMediaService(new ListingMediaRepository(fixture.db), fixture.storage);
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (fixture) await fixture.dispose();
});

/** Tạo metadata đã commit thật để các kết nối pool riêng cạnh tranh dưới khóa PostgreSQL. */
async function setup() {
  const owner = await fixture.user();
  const province = await fixture.province();
  const listing = await fixture.db.listing.create({
    data: {
      ownerId: owner.id,
      provinceId: province.id,
      title: "Media fixture listing",
      searchTitle: "media fixture listing",
      description: "Detailed media fixture description.",
      type: "SALE",
      price: 100,
    },
  });
  const media = await listingMedia.reserve(owner.id, 6);
  await listingMedia.write(media.id, owner.id, {
    detail: Buffer.from("detail"),
    thumbnail: Buffer.from("thumbnail"),
  });
  const asset = await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: media.id } });
  return { owner, listing, asset };
}

/** Đính kèm qua cùng ranh giới nội bộ mà transaction Listing tương lai sẽ gọi. */
async function attach(data: Awaited<ReturnType<typeof setup>>) {
  await fixture.db.$transaction(async (tx) => {
    await listingMedia.attach(
      {
        assets: [{ id: data.asset.id, position: 0 }],
        userId: data.owner.id,
        listingId: data.listing.id,
      },
      tx,
    );
  });
}

describe("Listing Media lifecycle and committed cleanup", () => {
  it("prevents a delayed S3 writer from replacing bytes after another writer attaches", async () => {
    const owner = await fixture.user();
    const province = await fixture.province();
    const listing = await fixture.db.listing.create({
      data: {
        ownerId: owner.id,
        provinceId: province.id,
        title: "Concurrent S3 listing",
        searchTitle: "concurrent s3 listing",
        description: "Concurrent image writer regression.",
        type: "SALE",
        price: 100,
      },
    });
    const client = new S3Client({ region: "test" });
    let entered!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Mô hình hóa ghi có điều kiện của provider theo cách nguyên tử sau khi yêu cầu trì hoãn đến storage.
    vi.spyOn(client, "send").mockImplementation(async (command) => {
      if (
        !(command instanceof PutObjectCommand) ||
        !command.input.Key ||
        !Buffer.isBuffer(command.input.Body)
      )
        throw new Error("Unexpected storage command");
      if (command.input.Body.equals(Buffer.from("second"))) {
        entered();
        await gate;
      }
      if (command.input.IfNoneMatch === "*" && fixture.objects.has(command.input.Key))
        throw new Error("PreconditionFailed");
      fixture.objects.set(command.input.Key, command.input.Body);
      return { $metadata: {} };
    });
    const storage = new S3ObjectStore(client, "fixture-private");
    const service = new ListingMediaService(new ListingMediaRepository(fixture.db), {
      ...fixture.storage,
      put: storage.put.bind(storage),
    });
    const media = await service.reserve(owner.id, 6);
    const delayed = service.write(media.id, owner.id, {
      detail: Buffer.from("second"),
      thumbnail: Buffer.from("second thumbnail"),
    });
    await ready;
    try {
      await service.write(media.id, owner.id, {
        detail: Buffer.from("detail"),
        thumbnail: Buffer.from("thumbnail"),
      });
      await fixture.db.$transaction((tx) =>
        service.attach(
          { assets: [{ id: media.id, position: 0 }], userId: owner.id, listingId: listing.id },
          tx,
        ),
      );
    } finally {
      release();
    }
    const result = await Promise.allSettled([delayed]);
    expect(result[0].status).toBe("rejected");
    expect(fixture.objects.get(`listing/v1/${media.id}.webp`)).toEqual(Buffer.from("detail"));
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: media.id } })).status,
    ).toBe("ATTACHED");
    client.destroy();
  });
  it("reconciles partial renditions when cancel and cleanup win against an in-flight writer", async () => {
    const owner = await fixture.user();
    const media = await listingMedia.reserve(owner.id, 6);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const put = fixture.storage.put.bind(fixture.storage);
    vi.spyOn(fixture.storage, "put").mockImplementation(async (key, bytes) => {
      if (key.endsWith(".thumbnail.webp")) {
        entered();
        await gate;
      }
      await put(key, bytes);
    });
    const writing = listingMedia.write(media.id, owner.id, {
      detail: Buffer.from("detail"),
      thumbnail: Buffer.from("thumbnail"),
    });
    await ready;
    await listingMedia.cancel(media.id, owner.id);
    await cleanup.detached(media.id, owner.id);
    release();
    await expect(writing).rejects.toMatchObject({ status: 409 });
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: media.id } })).deletedAt,
    ).toBeNull();
    await cleanup.detached(media.id, owner.id);
    expect(fixture.objects.size).toBe(0);
  });

  it("deduplicates cleanup racing cancellation", async () => {
    const data = await setup();
    await fixture.db.mediaAsset.update({
      where: { id: data.asset.id },
      data: { expiresAt: new Date(0) },
    });
    await Promise.all([cleanup.expired(), listingMedia.cancel(data.asset.id, data.owner.id)]);
    expect(
      await fixture.db.outboxEvent.count({
        where: { aggregateId: data.owner.id, eventType: "media.cleanup" },
      }),
    ).toBe(1);
    await cleanup.detached(data.asset.id, data.owner.id);
    expect(fixture.objects.size).toBe(0);
  });
  it("fences image cleanup completion after abandon even when deletedAt stays null", async () => {
    const data = await setup();
    await listingMedia.cancel(data.asset.id, data.owner.id);
    const claim = await repository.claim(data.asset.id, data.owner.id);
    expect(claim).not.toBeNull();
    if (!claim) throw new Error("Expected a committed cleanup claim");
    const uploads = new ListingMediaRepository(fixture.db);
    await fixture.db.$transaction(async (tx) => {
      await uploads.lockUser(data.owner.id, tx);
      await uploads.lockMedia([data.asset.id], tx);
      await uploads.abandon(data.asset.id, data.owner.id, tx);
    });
    expect(await repository.deleted(data.asset.id, data.owner.id, claim.cleanupVersion)).toEqual({
      count: 0,
    });
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: data.asset.id } })).deletedAt,
    ).toBeNull();
    await cleanup.detached(data.asset.id, data.owner.id);
    expect(fixture.objects.size).toBe(0);
  });
  it("keeps an attachment when cleanup waits for its commit, and rolls back a partial batch", async () => {
    const data = await setup();
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const attaching = fixture.db.$transaction(async (tx) => {
      await listingMedia.attach(
        {
          assets: [{ id: data.asset.id, position: 0 }],
          userId: data.owner.id,
          listingId: data.listing.id,
        },
        tx,
      );
      entered();
      await gate;
    });
    await ready;
    const removing = cleanup.detached(data.asset.id, data.owner.id);
    release();
    await Promise.all([attaching, removing]);
    expect(fixture.objects.has(data.asset.storageKey)).toBe(true);
    const fresh = await setup();
    const missing = await listingMedia.reserve(fresh.owner.id, 6);
    await expect(
      fixture.db.$transaction((tx) =>
        listingMedia.attach(
          {
            assets: [
              { id: fresh.asset.id, position: 0 },
              { id: missing.id, position: 1 },
            ],
            userId: fresh.owner.id,
            listingId: fresh.listing.id,
          },
          tx,
        ),
      ),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_READY" });
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: fresh.asset.id } })).status,
    ).toBe("TEMP");
  });
  it("deduplicates reconciliation into durable leased jobs and preserves private HTTP access", async () => {
    const data = await setup();
    await fixture.db.mediaAsset.update({
      where: { id: data.asset.id },
      data: { expiresAt: new Date(0) },
    });
    await Promise.all([cleanup.expired(), cleanup.expired()]);
    expect(
      await fixture.db.outboxEvent.count({
        where: { aggregateId: data.owner.id, eventType: "media.cleanup", status: "PENDING" },
      }),
    ).toBe(1);
    expect(await repository.expired()).not.toContainEqual({
      id: data.asset.id,
      uploadedById: data.owner.id,
    });
    for (const path of [
      `/${data.asset.storageKey}`,
      `/media/${data.asset.storageKey}`,
      `/.local-media/${data.asset.storageKey}`,
    ]) {
      expect((await request(fixture.app).get(path)).status).toBe(404);
    }
    await Promise.all([fixture.cleanup.runOnce(), fixture.cleanup.runOnce()]);
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: data.asset.id } })).deletedAt,
    ).not.toBeNull();
  });

  it("recovers old objects written after a tombstone while protecting active attachments", async () => {
    const data = await setup();
    await listingMedia.cancel(data.asset.id, data.owner.id);
    await cleanup.detached(data.asset.id, data.owner.id);
    fixture.objects.set(data.asset.storageKey, Buffer.from("late writer"));
    const orphanKey = `listing/v1/${randomUUID()}.webp`;
    fixture.objects.set(orphanKey, Buffer.from("orphan"));
    const recovery = new MediaOrphanRecovery(repository, {
      ...fixture.storage,
      /** Mô phỏng metadata inventory cũ; mọi kiểm tra lại database vẫn dùng PostgreSQL. */
      async *listManaged() {
        yield { key: data.asset.storageKey, modifiedAt: new Date(0) };
        yield { key: orphanKey, modifiedAt: new Date(0) };
      },
    });
    await recovery.runBatch();
    expect(fixture.objects.has(orphanKey)).toBe(false);
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: data.asset.id } })).deletedAt,
    ).toBeNull();
    await cleanup.detached(data.asset.id, data.owner.id);
    expect(fixture.objects.has(data.asset.storageKey)).toBe(false);
    const fresh = await setup();
    await attach(fresh);
    expect(await repository.orphanAbsent(fresh.asset.id, fresh.asset.storageKey)).toBe(false);
  });
  it("does not claim a fresh TEMP, and refuses stale cleanup after attachment", async () => {
    const data = await setup();
    expect(data.asset.expiresAt!.getTime() - data.asset.createdAt.getTime()).toBeGreaterThan(
      14 * 60_000,
    );
    await cleanup.detached(data.asset.id, data.owner.id);
    expect(fixture.objects.has(data.asset.storageKey)).toBe(true);
    await attach(data);
    await cleanup.detached(data.asset.id, data.owner.id);
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: data.asset.id } })).status,
    ).toBe("ATTACHED");
    expect(fixture.deletedKeys).toEqual([]);
  });

  it("reconciles expired TEMP and DELETING without expiry; duplicate workers are idempotent", async () => {
    const data = await setup();
    await fixture.db.mediaAsset.update({
      where: { id: data.asset.id },
      data: { expiresAt: new Date(0) },
    });
    expect(await repository.expired()).toContainEqual({
      id: data.asset.id,
      uploadedById: data.owner.id,
    });
    await Promise.all([
      cleanup.detached(data.asset.id, data.owner.id),
      cleanup.detached(data.asset.id, data.owner.id),
    ]);
    const deleted = await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: data.asset.id } });
    expect(deleted.deletedAt).not.toBeNull();
    expect(fixture.objects.size).toBe(0);
    await expect(attach(data)).rejects.toMatchObject({ status: 409 });
    await fixture.db.mediaAsset.update({
      where: { id: data.asset.id },
      data: { deletedAt: null, expiresAt: null },
    });
    expect(await repository.expired()).toContainEqual({
      id: data.asset.id,
      uploadedById: data.owner.id,
    });
    await cleanup.detached(data.asset.id, data.owner.id);
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: data.asset.id } })).deletedAt,
    ).not.toBeNull();
  });

  it("retries storage failure and crash after object removal before database completion", async () => {
    const data = await setup();
    await listingMedia.cancel(data.asset.id, data.owner.id);
    fixture.failures.deletion = true;
    await expect(cleanup.detached(data.asset.id, data.owner.id)).rejects.toThrow(
      "Fixture storage outage",
    );
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: data.asset.id } })).deletedAt,
    ).toBeNull();
    fixture.failures.deletion = false;
    const completion = vi
      .spyOn(repository, "deleted")
      .mockRejectedValueOnce(new Error("Database completion outage"));
    await expect(cleanup.detached(data.asset.id, data.owner.id)).rejects.toThrow(
      "Database completion outage",
    );
    expect(fixture.objects.size).toBe(0);
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: data.asset.id } })).deletedAt,
    ).toBeNull();
    await cleanup.detached(data.asset.id, data.owner.id);
    expect(completion).toHaveBeenCalledTimes(2);
    expect(
      (await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: data.asset.id } })).deletedAt,
    ).not.toBeNull();
  });

  it("cancels once, rejects foreign ownership and does not cancel ATTACHED", async () => {
    const data = await setup();
    const other = await fixture.user();
    await expect(listingMedia.cancel(data.asset.id, other.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      fixture.db.$transaction((tx) =>
        listingMedia.attach(
          {
            assets: [{ id: data.asset.id, position: 0 }],
            userId: other.id,
            listingId: data.listing.id,
          },
          tx,
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await Promise.all([
      listingMedia.cancel(data.asset.id, data.owner.id),
      listingMedia.cancel(data.asset.id, data.owner.id),
    ]);
    expect(
      await fixture.db.outboxEvent.count({
        where: { aggregateId: data.owner.id, eventType: "media.cleanup" },
      }),
    ).toBe(1);
    const fresh = await setup();
    await attach(fresh);
    await expect(listingMedia.cancel(fresh.asset.id, fresh.owner.id)).rejects.toMatchObject({
      code: "MEDIA_ALREADY_ATTACHED",
    });
  });

  it("requires a completed server manifest, an active owner and an unexpired reservation", async () => {
    const data = await setup();
    fixture.objects.delete(data.asset.storageKey.replace(/\.webp$/, ".complete"));
    await expect(attach(data)).rejects.toMatchObject({ code: "MEDIA_NOT_READY" });
    await fixture.db.mediaAsset.update({
      where: { id: data.asset.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(attach(data)).rejects.toMatchObject({ status: 409 });
    await fixture.db.user.update({
      where: { id: data.owner.id },
      data: { status: "PENDING_DELETION", deletionRequestedAt: new Date() },
    });
    await expect(listingMedia.reserve(data.owner.id, 6)).rejects.toMatchObject({ status: 403 });
  });

  it("serializes attach versus cancel and two Listing attachments", async () => {
    const data = await setup();
    const result = await Promise.allSettled([
      attach(data),
      listingMedia.cancel(data.asset.id, data.owner.id),
    ]);
    expect(result.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const state = await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: data.asset.id } });
    await cleanup.detached(data.asset.id, data.owner.id);
    expect(fixture.objects.has(data.asset.storageKey)).toBe(state.status === "ATTACHED");
    const fresh = await setup();
    const otherListing = await fixture.db.listing.create({
      data: {
        id: randomUUID(),
        ownerId: fresh.owner.id,
        provinceId: fresh.listing.provinceId,
        title: "Other fixture listing",
        searchTitle: "other fixture listing",
        description: "Other detailed fixture description.",
        type: "SALE",
        price: 100,
      },
    });
    const attempts = await Promise.allSettled([
      attach(fresh),
      attach({ ...fresh, listing: otherListing }),
    ]);
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  });

  it("rechecks expiry under the shared lock during attach versus cleanup", async () => {
    const data = await setup();
    // Cả hai nhánh cạnh tranh advisory lock thật đang giữ, rồi đọc lại hàng cố ý hết hạn.
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const holder = fixture.db.$transaction(async (tx) => {
      await lockResources(tx, [`user:${data.owner.id}`]);
      await tx.mediaAsset.update({
        where: { id: data.asset.id },
        data: { expiresAt: new Date(0) },
      });
      entered();
      await gate;
    });
    await ready;
    const attachment = attach(data);
    const removal = cleanup.detached(data.asset.id, data.owner.id);
    release();
    await holder;
    const results = await Promise.allSettled([attachment, removal]);
    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("fulfilled");
    expect(fixture.objects.size).toBe(0);
  });

  it("does not perform a physical deletion on a rolled-back attachment/cancellation", async () => {
    const data = await setup();
    await expect(
      fixture.db.$transaction(async (tx) => {
        await listingMedia.attach(
          {
            assets: [{ id: data.asset.id, position: 0 }],
            userId: data.owner.id,
            listingId: data.listing.id,
          },
          tx,
        );
        throw new Error("Listing save failed");
      }),
    ).rejects.toThrow("Listing save failed");
    await attach(data);
    await cleanup.detached(data.asset.id, data.owner.id);
    expect(fixture.objects.has(data.asset.storageKey)).toBe(true);
    expect(fixture.deletedKeys).toEqual([]);
  });

  it("protects any Message reference even when legacy purpose is not CHAT", async () => {
    const data = await setup();
    const peer = await fixture.user();
    const conversation = await fixture.db.conversation.create({
      data: {
        type: "LISTING",
        listingId: data.listing.id,
        initiatorId: peer.id,
        contactUserId: peer.id,
      },
    });
    await fixture.db.message.create({
      data: {
        conversationId: conversation.id,
        senderId: peer.id,
        requestId: randomUUID(),
        type: "TEXT",
        imageMediaId: data.asset.id,
        payloadHash: "fixture",
      },
    });
    await expect(attach(data)).rejects.toMatchObject({ status: 409 });
    await expect(listingMedia.cancel(data.asset.id, data.owner.id)).rejects.toMatchObject({
      status: 409,
    });
    await fixture.db.mediaAsset.update({
      where: { id: data.asset.id },
      data: { expiresAt: new Date(0) },
    });
    await cleanup.detached(data.asset.id, data.owner.id);
    expect(fixture.objects.has(data.asset.storageKey)).toBe(true);
    expect(await repository.expired()).not.toContainEqual({
      id: data.asset.id,
      uploadedById: data.owner.id,
    });
  });
});
