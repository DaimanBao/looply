import { mkdtemp, rmdir, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LocalObjectStore } from "./object-store";

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
