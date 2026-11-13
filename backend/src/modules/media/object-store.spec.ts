import { mkdtemp, rmdir } from "node:fs/promises";
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
      await store.delete(key); await store.delete(key); await expect(store.get(key)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await store.delete(key); await rmdir(join(directory, "profile")); await rmdir(directory); }
  });
});
