import { mkdtemp, rmdir, symlink, unlink, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { LocalObjectStore, S3ObjectStore } from "./object-store";

describe("Private S3 object storage", () => {
  it("preserves video MIME/immutability and uses HEAD plus bounded upstream byte ranges", async () => {
    const directory = await mkdtemp(join(tmpdir(), "looply-s3-video-test-")); const path = join(directory, "input"); await writeFile(path, "video");
    const client = new S3Client({ region: "test" });
    const send = vi.spyOn(client, "send").mockImplementation(async () => ({ $metadata: {} })); const store = new S3ObjectStore(client, "private");
    try {
      await store.putFile("listing/v1/video.mp4", path, "video/mp4", 5);
      expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand); expect(send.mock.calls[0]?.[0].input).toMatchObject({ ContentType: "video/mp4", ContentLength: 5, IfNoneMatch: "*" });
      send.mockImplementationOnce(async () => ({ ContentLength: 5 })); expect(await store.size("listing/v1/video.mp4")).toBe(5); expect(send.mock.calls[1]?.[0]).toBeInstanceOf(HeadObjectCommand);
      send.mockImplementationOnce(async () => ({ ContentLength: 2, ContentRange: "bytes 1-2/5", Body: Readable.from([Buffer.from("id")]) }));
      const stream = await store.readRange("listing/v1/video.mp4", 1, 2); const parts: Buffer[] = []; for await (const part of stream) parts.push(Buffer.from(part)); expect(Buffer.concat(parts).toString()).toBe("id");
      expect(send.mock.calls[2]?.[0].input).toMatchObject({ Range: "bytes=1-2" });
      send.mockImplementationOnce(async () => ({ ContentLength: 5, Body: Readable.from([Buffer.from("video")]) }));
      await expect(store.readRange("listing/v1/video.mp4", 1, 2)).rejects.toThrow("Invalid private range response");
    } finally { send.mockRestore(); client.destroy(); await rm(directory, { recursive: true, force: true }); }
  });
  it("uses immutable writes and bounded provider requests, propagating write conflicts", async () => {
    const client = new S3Client({ region: "test" });
    const send = vi.spyOn(client, "send").mockImplementation(async () => ({ $metadata: {} }));
    const store = new S3ObjectStore(client, "fixture-private");
    try {
      await store.put("profile/fixture.webp", Buffer.from("private"));
      expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
      expect(send.mock.calls[0]?.[0].input).toMatchObject({ IfNoneMatch: "*" });
      await expect(store.get("profile/fixture.webp")).rejects.toMatchObject({ status: 404 });
      expect(send.mock.calls[1]?.[0]).toBeInstanceOf(GetObjectCommand);
      await store.delete("profile/fixture.webp");
      expect(send.mock.calls[2]?.[0]).toBeInstanceOf(DeleteObjectCommand);
      for (const call of send.mock.calls) expect(call[1]).toMatchObject({ abortSignal: expect.any(AbortSignal) });
      send.mockRejectedValueOnce(new Error("PreconditionFailed"));
      await expect(store.put("profile/fixture.webp", Buffer.from("replacement"))).rejects.toThrow("PreconditionFailed");
    } finally { send.mockRestore(); client.destroy(); }
  });
});

describe("Private local object storage", () => {
  it("stores private bytes, rejects traversal and makes deletion idempotent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "looply-media-test-")); const store = new LocalObjectStore(directory); const key = `profile/${randomUUID()}.webp`;
    try {
      await store.put(key, Buffer.from("fixture-image")); expect(await store.get(key)).toEqual(Buffer.from("fixture-image"));
      await expect(store.get("../../outside-root")).rejects.toMatchObject({ status: 503 });
      for (const invalid of ["profile/../secret", "profile//image", "./profile/image", "/profile/image", "profile\\image", "C:/image"]) {
        await expect(store.delete(invalid)).rejects.toMatchObject({ status: 503 });
      }
      await store.delete(key); await store.delete(key); await expect(store.get(key)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await store.delete(key); await rmdir(join(directory, "profile")); await rmdir(directory); }
  });
  it("refuses symlinked directories and inventories only generated application objects", async () => {
    const directory = await mkdtemp(join(tmpdir(), "looply-media-test-"));
    const outside = await mkdtemp(join(tmpdir(), "looply-media-outside-"));
    const store = new LocalObjectStore(directory); const key = `profile/${randomUUID()}.webp`;
    try {
      await symlink(outside, join(directory, "linked"), "junction");
      await expect(store.put("linked/private.webp", Buffer.from("private"))).rejects.toMatchObject({ status: 503 });
      await store.put(key, Buffer.from("private"));
      const inventory = [];
      for await (const entry of store.listManaged()) inventory.push(entry.key);
      expect(inventory).toEqual([key]);
    } finally {
      await store.delete(key); await unlink(join(directory, "linked"));
      await rmdir(join(directory, "profile")); await rmdir(directory); await rmdir(outside);
    }
  });
});
