import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import request from "supertest";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAuthFixture, type AuthFixture } from "../helpers/auth-fixture";
import { LocalObjectStore } from "../../src/modules/media/object-store";
import { MediaCleanupService } from "../../src/modules/media/media-cleanup.service";
import { MediaCleanupRepository } from "../../src/modules/media/media-cleanup.repository";
import { MediaOrphanRecovery } from "../../src/modules/media/media-orphan-recovery.service";
import { listingContract } from "../helpers/listing-contract";
import { request as httpRequest } from "node:http";
import { AddressInfo } from "node:net";

let fixture: AuthFixture; let directory: string; let store: LocalObjectStore; let token: string; let ownerId: string; let provinceCode: string; let imageId: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "looply-video-http-test-")); store = new LocalObjectStore(join(directory, "objects"));
  vi.stubEnv("MEDIA_STAGING_DIRECTORY", join(directory, "staging"));
  fixture = await createAuthFixture(store); const owner = await fixture.user(); ownerId = owner.id;
  token = (await fixture.db.$transaction((tx) => fixture.sessions.create(owner, tx))).accessToken; provinceCode = (await fixture.province()).code;
  const image = await sharp({ create: { width: 32, height: 24, channels: 3, background: "blue" } }).png().toBuffer();
  imageId = z.uuid().parse((await upload(image).expect(201)).body.id);
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); if (fixture) await fixture.dispose(); if (directory) await rm(directory, { recursive: true, force: true }); });
/** Uploads raw bytes through the real HTTP middleware, private local storage and PostgreSQL lifecycle. */
function upload(bytes: Buffer, as = token) { return request(fixture.app).post("/api/media/listing-uploads").auth(as, { type: "bearer" }).set("Content-Type", "application/octet-stream").send(bytes); }
/** Uses synthetic committed video files independent of production resources. */
function bytes(extension = "mp4") { return readFile(resolve("tests/fixtures/video", `valid.${extension}`)); }
/** Creates a minimal complete Listing request with an optional video attachment. */
function input(videoId: string | null, images = [imageId]) { return { title: "Video listing fixture", description: "A complete description for the video fixture.", type: "SALE", price: "100", rentalUnit: null, provinceCode, media: { imageIds: images, videoId } }; }
/** Publishes a ready video and returns only its contract UUID. */
async function video(extension = "mp4") { const result = await upload(await bytes(extension)).expect(201); expect(listingContract("ListingUpload").safeParse(result.body).success).toBe(true); return z.uuid().parse(result.body.id); }
/** Creates a Listing and asserts transaction success before tests inspect its media. */
async function listing(videoId: string | null) { return z.object({ id: z.uuid(), version: z.number() }).parse((await request(fixture.app).post("/api/listings").auth(token, { type: "bearer" }).send(input(videoId)).expect(201)).body); }
/** Uses the production cleanup coordinator with the same real local adapter as uploads. */
function cleanup() { const repository = new MediaCleanupRepository(fixture.db); return new MediaCleanupService(repository, store, new MediaOrphanRecovery(repository, store)); }

describe("Listing videos with real PostgreSQL, local files and FFmpeg", () => {
  it.each(["mp4", "webm"])("uploads, attaches and delivers unchanged private %s with correct MIME and ranges", async (extension) => {
    const original = await bytes(extension); const id = await video(extension); const row = await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ type: "VIDEO", status: "TEMP", listingId: null, durationSeconds: 1, sizeBytes: BigInt(original.length) });
    expect(row.expiresAt!.getTime() - row.createdAt.getTime()).toBeGreaterThan(899000);
    await request(fixture.app).get(`/api/listings/${randomUUID()}/media/${id}`).expect(404);
    const item = await listing(id); const path = `/api/listings/${item.id}/media/${id}`;
    const full = await request(fixture.app).get(path).buffer(true).expect(200);
    expect(full.headers).toMatchObject({ "content-type": `video/${extension}`, "content-length": String(original.length), "accept-ranges": "bytes", "cache-control": "no-store" });
    expect(full.body).toEqual(original);
    for (const [range, start, end] of [["bytes=0-0", 0, 0], ["bytes=10-19", 10, 19], ["bytes=10-", 10, original.length - 1], ["bytes=-10", original.length - 10, original.length - 1]] as const) {
      const partial = await request(fixture.app).get(path).set("Range", range).buffer(true).expect(206);
      expect(partial.headers["content-range"]).toBe(`bytes ${start}-${end}/${original.length}`); expect(partial.headers["content-length"]).toBe(String(end - start + 1)); expect(partial.body).toEqual(original.subarray(start, end + 1));
    }
    for (const range of ["bytes=999999-", "bytes=0-1,3-4", "bytes=-0", "bad"]) {
      const error = await request(fixture.app).get(path).set("Range", range).expect(416); expect(error.headers["content-range"]).toBe(`bytes */${original.length}`); expect(error.body.error.code).toBe("INVALID_RANGE");
    }
    await request(fixture.app).get(path).set("If-Range", '"old"').set("Range", "bytes=0-1").expect(200);
    await request(fixture.app).get(path).query({ variant: "thumbnail" }).expect(400);
    await request(fixture.app).get(`/api/listings/${item.id}/media/${imageId}`).expect(200).expect("Content-Type", /image\/webp/);
    await request(fixture.app).get(`/api/listings/${item.id}/media/${imageId}`).set("Range", "bytes=0-1").set("If-Range", '"old"').expect(416);
    await request(fixture.app).head(path).set("Range", "bytes=0-1").expect(200).expect("Content-Length", String(original.length));
    expect(await readdir(join(directory, "staging"))).toEqual([]);
  });
  it("keeps image upload/delivery working when the video executable is absent", async () => {
    vi.stubEnv("MEDIA_FFPROBE_PATH", join(directory, "missing.exe"));
    const failed = await upload(await bytes()).expect(503); expect(JSON.stringify(failed.body)).not.toContain(directory);
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "blue" } }).png().toBuffer(); await upload(png).expect(201);
    const item = await listing(null);
    await request(fixture.app).get(`/api/listings/${item.id}/media/${imageId}`).expect(200);
    expect(await fixture.db.mediaAsset.count({ where: { uploadedById: ownerId, type: "VIDEO" } })).toBe(0);
    expect(await readdir(join(directory, "staging"))).toEqual([]);
  });
  it("rejects spoofed/corrupted content, MIME transport mismatch and missing authentication without metadata", async () => {
    const original = await bytes();
    await upload(original.subarray(0, 20)).expect(415);
    await upload(Buffer.from("fake video.mp4")).expect(415);
    await request(fixture.app).post("/api/media/listing-uploads").auth(token, { type: "bearer" }).set("Content-Type", "video/mp4").send(original).expect(415);
    await request(fixture.app).post("/api/media/listing-uploads").set("Content-Type", "application/octet-stream").send(original).expect(401);
    expect(await fixture.db.mediaAsset.count({ where: { uploadedById: ownerId, type: "VIDEO" } })).toBe(0);
  });
  it("applies current ownership, hidden/deleted, Block and account lifecycle visibility", async () => {
    const id = await video(); const item = await listing(id); const path = `/api/listings/${item.id}/media/${id}`;
    const peer = await fixture.user(); const peerToken = (await fixture.db.$transaction((tx) => fixture.sessions.create(peer, tx))).accessToken;
    await fixture.db.userBlock.create({ data: { blockerId: peer.id, blockedId: ownerId } });
    await request(fixture.app).get(path).auth(peerToken, { type: "bearer" }).expect(404);
    await request(fixture.app).get(path).auth("invalid", { type: "bearer" }).expect(401);
    await request(fixture.app).patch(`/api/listings/${item.id}/visibility`).auth(token, { type: "bearer" }).send({ expectedVersion: 1, status: "HIDDEN" }).expect(200);
    await request(fixture.app).get(path).expect(404); await request(fixture.app).get(path).auth(token, { type: "bearer" }).expect(200);
    await fixture.db.user.update({ where: { id: ownerId }, data: { status: "PENDING_DELETION", deletionRequestedAt: new Date() } });
    await request(fixture.app).get(path).expect(404); await upload(await bytes()).expect(403);
    await fixture.db.user.update({ where: { id: ownerId }, data: { status: "ACTIVE", deletionRequestedAt: null } });
    await request(fixture.app).delete(`/api/listings/${item.id}`).auth(token, { type: "bearer" }).send({ expectedVersion: 2, confirmDelete: true }).expect(204);
    await request(fixture.app).get(path).auth(token, { type: "bearer" }).expect(404);
  });
  it("rolls back the entire image/video attachment when one asset is foreign or not ready", async () => {
    const id = await video(); const peer = await fixture.user();
    await fixture.db.mediaAsset.update({ where: { id }, data: { uploadedById: peer.id } });
    await request(fixture.app).post("/api/listings").auth(token, { type: "bearer" }).send(input(id)).expect(404);
    expect(await fixture.db.listing.count({ where: { ownerId } })).toBe(0); expect((await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: imageId } })).status).toBe("TEMP");
    await fixture.db.mediaAsset.update({ where: { id }, data: { uploadedById: ownerId } });
    const row = await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id } }); await store.delete(`${row.storageKey}.complete`);
    await request(fixture.app).post("/api/listings").auth(token, { type: "bearer" }).send(input(id)).expect(409);
    expect(await fixture.db.listing.count({ where: { ownerId } })).toBe(0); expect((await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: imageId } })).status).toBe("TEMP");
  });
  it("allows concurrent uploads and only one concurrent attachment of the same video", async () => {
    const originals = await bytes(); const results = await Promise.all([upload(originals), upload(originals)]); expect(results.map((response) => response.status)).toEqual([201, 201]);
    const ids = results.map((response) => z.uuid().parse(response.body.id)); expect(new Set(ids).size).toBe(2);
    const races = await Promise.all([0, 1].map(() => request(fixture.app).post("/api/listings").auth(token, { type: "bearer" }).send(input(ids[0]!))));
    expect(races.map((result) => result.status).sort()).toEqual([201, 409]); expect(await fixture.db.listing.count({ where: { ownerId } })).toBe(1);
  });
  it("preserves the previous video on replacement failure and cleans all replaced variants after commit", async () => {
    const oldId = await video(); const item = await listing(oldId); const replacement = await video("webm");
    const fresh = await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: replacement } }); await store.delete(`${fresh.storageKey}.complete`);
    const patch = () => request(fixture.app).patch(`/api/listings/${item.id}`).auth(token, { type: "bearer" }).send({ expectedVersion: 1, media: { imageIds: [imageId], videoId: replacement } });
    await patch().expect(409); expect((await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: oldId } })).status).toBe("ATTACHED");
    await store.put(`${fresh.storageKey}.complete`, Buffer.from("looply-video-v1")); await patch().expect(200);
    expect((await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: oldId } })).listingId).toBeNull();
    await cleanup().detached(oldId, ownerId); await cleanup().detached(oldId, ownerId);
    expect((await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id: oldId } })).deletedAt).not.toBeNull();
    await request(fixture.app).get(`/api/listings/${item.id}/media/${replacement}`).expect(200);
  });
  it("expires TEMP, cancels idempotently and protects current attachments from stale cleanup", async () => {
    const id = await video(); const row = await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id } });
    await fixture.db.mediaAsset.update({ where: { id }, data: { expiresAt: new Date(0) } });
    await request(fixture.app).post("/api/listings").auth(token, { type: "bearer" }).send(input(id)).expect(409);
    await cleanup().detached(id, ownerId); await expect(store.size(row.storageKey)).rejects.toThrow();
    const cancelId = await video();
    for (let i = 0; i < 2; i++) await request(fixture.app).delete(`/api/media/listing-uploads/${cancelId}`).auth(token, { type: "bearer" }).expect(204);
    await cleanup().detached(cancelId, ownerId);
    const attached = await video(); const item = await listing(attached); await cleanup().detached(attached, ownerId);
    await request(fixture.app).get(`/api/listings/${item.id}/media/${attached}`).expect(200);
  });
  it("recovers late storage failures through outbox cleanup and discovers orphan video/markers", async () => {
    const originalPut = store.put.bind(store); const put = vi.spyOn(store, "put").mockImplementation(async (key, value) => { if (key.endsWith(".mp4.complete")) throw new Error("storage failure"); await originalPut(key, value); });
    await upload(await bytes()).expect(503); put.mockRestore();
    const failed = await fixture.db.mediaAsset.findFirstOrThrow({ where: { uploadedById: ownerId, type: "VIDEO" } }); expect(failed.status).toBe("DELETING");
    await cleanup().detached(failed.id, ownerId); await expect(store.size(failed.storageKey)).rejects.toThrow();
    const key = `listing/v1/${randomUUID()}.mp4`; await store.put(key, await bytes()); await store.put(`${key}.complete`, Buffer.from("looply-video-v1"));
    const old = new Date(Date.now() - 20 * 60000); for (const file of [key, `${key}.complete`]) await utimes(join(directory, "objects", file), old, old);
    await new MediaOrphanRecovery(new MediaCleanupRepository(fixture.db), store).runBatch(); await expect(store.size(key)).rejects.toThrow(); await expect(store.size(`${key}.complete`)).rejects.toThrow();
  });
  it("reclaims crash-left staging directories while leaving fresh private uploads intact", async () => {
    const stale = join(directory, "staging", "upload-Abc123"); const fresh = join(directory, "staging", "upload-Def456");
    const { mkdir } = await import("node:fs/promises"); await mkdir(stale); await mkdir(fresh); await writeFile(join(stale, "input"), "partial"); const old = new Date(Date.now() - 2 * 60 * 60000); await utimes(stale, old, old);
    await video(); expect(await readdir(join(directory, "staging"))).toEqual(["upload-Def456"]);
  });
  it("supports five real images plus one video and rejects a second video in the image slot", async () => {
    const imageBytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toBuffer();
    const images = [imageId]; for (let i = 0; i < 4; i++) images.push(z.uuid().parse((await upload(imageBytes).expect(201)).body.id));
    const id = await video(); const result = await request(fixture.app).post("/api/listings").auth(token, { type: "bearer" }).send(input(id, images)).expect(201);
    expect(listingContract("ListingDetail").safeParse(result.body).success).toBe(true);
    expect(await fixture.db.mediaAsset.count({ where: { listingId: result.body.id, status: "ATTACHED" } })).toBe(6);
    const second = await video(); await request(fixture.app).patch(`/api/listings/${result.body.id}`).auth(token, { type: "bearer" }).send({ expectedVersion: 1, media: { imageIds: [second], videoId: id } }).expect(404);
  });
  it("bounds upload concurrency and allows retry after the occupied slot is released", async () => {
    vi.stubEnv("MEDIA_UPLOAD_CONCURRENCY", "1");
    let ready!: () => void; let release!: () => void; const started = new Promise<void>((resolve) => { ready = resolve; }); const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = store.putFile.bind(store); const writer = vi.spyOn(store, "putFile").mockImplementation(async (...args) => { await original(...args); ready(); await gate; });
    const first = upload(await bytes()).then((response) => response);
    try { await started; const busy = await upload(await bytes()).expect(503); expect(busy.body.error.code).toBe("MEDIA_UPLOAD_BUSY"); }
    finally { release(); }
    expect((await first).status).toBe(201); writer.mockRestore(); await video();
  });
  it("recovers a cleanup/cancel race while storage publication is still in flight", async () => {
    let ready!: () => void; let release!: () => void; const started = new Promise<void>((resolve) => { ready = resolve; }); const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = store.putFile.bind(store); vi.spyOn(store, "putFile").mockImplementation(async (...args) => { await original(...args); ready(); await gate; });
    const pending = upload(await bytes()).then((response) => response);
    let id = "";
    try {
      await started; const asset = await fixture.db.mediaAsset.findFirstOrThrow({ where: { uploadedById: ownerId, type: "VIDEO" } }); id = asset.id;
      await request(fixture.app).delete(`/api/media/listing-uploads/${id}`).auth(token, { type: "bearer" }).expect(204);
      await cleanup().detached(id, ownerId);
    } finally { release(); }
    expect((await pending).status).toBe(409);
    const asset = await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id } }); expect(asset.status).toBe("DELETING"); expect(asset.deletedAt).toBeNull();
    await cleanup().detached(id, ownerId); await expect(store.size(asset.storageKey)).rejects.toThrow();
  });
  it("retries stale cleanup completion when a late writer reopens cleanup after object deletion", async () => {
    let writing!: () => void; let finishWrite!: () => void; let deleting!: () => void; let finishDelete!: () => void;
    const started = new Promise<void>((resolve) => { writing = resolve; }); const writeGate = new Promise<void>((resolve) => { finishWrite = resolve; });
    const removed = new Promise<void>((resolve) => { deleting = resolve; }); const deleteGate = new Promise<void>((resolve) => { finishDelete = resolve; });
    const put = store.putFile.bind(store); const remove = store.delete.bind(store);
    vi.spyOn(store, "putFile").mockImplementation(async (...args) => { writing(); await writeGate; await put(...args); });
    const deletion = vi.spyOn(store, "delete").mockImplementation(async (key) => { await remove(key); if (key.endsWith(".mp4.complete")) { deleting(); await deleteGate; } });
    // A due outbox event must recover without inventory, including S3 deployments.
    const inventory = vi.spyOn(store, "listManaged");
    const pending = upload(await bytes()).then((response) => response);
    let task: Promise<boolean> | undefined; let id = ""; let key = "";
    try {
      await Promise.race([started, pending.then((response) => { throw new Error(`Upload ended before writing (${response.status})`); })]);
      const asset = await fixture.db.mediaAsset.findFirstOrThrow({ where: { uploadedById: ownerId, type: "VIDEO" } }); id = asset.id; key = asset.storageKey;
      await request(fixture.app).delete(`/api/media/listing-uploads/${id}`).auth(token, { type: "bearer" }).expect(204);
      task = fixture.cleanup.runOnce(); await removed;
      finishWrite(); expect((await pending).status).toBe(409); expect(await store.size(key)).toBeGreaterThan(0);
    } finally { finishWrite(); finishDelete(); }
    expect(await task).toBe(true);
    const job = await fixture.db.outboxEvent.findFirstOrThrow({ where: { aggregateId: ownerId, eventType: "media.cleanup" } });
    expect(job).toMatchObject({ status: "FAILED", lastError: "CLEANUP_RETRY", attempts: 1 }); expect(job.nextRetryAt).not.toBeNull();
    expect((await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
    deletion.mockRestore(); await fixture.db.outboxEvent.update({ where: { id: job.id }, data: { nextRetryAt: new Date(0) } });
    expect(await fixture.cleanup.runOnce()).toBe(true); expect(inventory).not.toHaveBeenCalled();
    await expect(store.size(key)).rejects.toThrow();
    expect((await fixture.db.mediaAsset.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    expect(await fixture.db.outboxEvent.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "PROCESSED", attempts: 2 });
  });
  it("refuses publication when the account or TEMP expiry changes during the write", async () => {
    for (const change of ["account", "expiry"]) {
      let ready!: () => void; let release!: () => void; const started = new Promise<void>((resolve) => { ready = resolve; }); const gate = new Promise<void>((resolve) => { release = resolve; });
      const original = store.putFile.bind(store); const writer = vi.spyOn(store, "putFile").mockImplementation(async (...args) => { await original(...args); ready(); await gate; });
      const pending = upload(await bytes()).then((response) => response);
      try {
        await started;
        if (change === "account") await fixture.db.user.update({ where: { id: ownerId }, data: { status: "PENDING_DELETION", deletionRequestedAt: new Date() } });
        else await fixture.db.mediaAsset.updateMany({ where: { uploadedById: ownerId, type: "VIDEO", status: "TEMP" }, data: { expiresAt: new Date(0) } });
      } finally { release(); }
      expect((await pending).status).toBe(change === "account" ? 403 : 409); writer.mockRestore();
      await fixture.db.user.update({ where: { id: ownerId }, data: { status: "ACTIVE", deletionRequestedAt: null } });
    }
  });
  it("removes an incomplete disconnected upload and releases the slot for retry", async () => {
    const server = fixture.app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    const pending = httpRequest({ host: "127.0.0.1", port, method: "POST", path: "/api/media/listing-uploads", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream", "Content-Length": "10000" } });
    pending.on("error", () => {});
    try {
      pending.write((await bytes()).subarray(0, 100));
      await vi.waitFor(async () => expect((await readdir(join(directory, "staging"))).length).toBe(1));
      pending.destroy();
      await vi.waitFor(async () => expect(await readdir(join(directory, "staging"))).toEqual([]));
      expect(await fixture.db.mediaAsset.count({ where: { uploadedById: ownerId, type: "VIDEO" } })).toBe(0); await video();
    } finally { pending.destroy(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
  it("rejects declared oversized input before staging bytes", async () => {
    await request(fixture.app).post("/api/media/listing-uploads").auth(token, { type: "bearer" }).set("Content-Type", "application/octet-stream").set("Content-Length", String(100 * 1024 * 1024 + 1)).send(Buffer.from("x")).expect(413);
    expect(await readdir(join(directory, "staging"))).toEqual([]);
  });
});
