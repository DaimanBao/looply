import { describe, expect, it, vi } from "vitest";
import { MediaOrphanRecovery } from "./media-orphan-recovery.service";
import type { MediaCleanupRepository } from "./media-cleanup.repository";
import type { ObjectStore, StoredMediaObject } from "./object-store";

const id = "01234567-89ab-4cde-8fab-0123456789ab";
const key = `listing/v1/${id}.thumbnail.webp`;

/** Dùng inventory ngoài giả, giữ kiểm tra lại phụ thuộc PostgreSQL trong integration test. */
function setup(entries: StoredMediaObject[]) {
  const repository = {
    byKey: vi.fn<MediaCleanupRepository["byKey"]>().mockResolvedValue(null),
    orphanAbsent: vi.fn<MediaCleanupRepository["orphanAbsent"]>().mockResolvedValue(true),
    recoverTombstone: vi.fn<MediaCleanupRepository["recoverTombstone"]>(),
  };
  const storage: ObjectStore = {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    /** Biểu diễn cursor provider được tiếp tục thay vì khởi động lại mỗi nhịp worker. */
    async *listManaged() {
      yield* entries;
    },
  };
  return { repository, storage, recovery: new MediaOrphanRecovery(repository, storage) };
}

describe("Bounded local orphan recovery", () => {
  it("protects fresh writes, checks namespace and requires a committed absence recheck", async () => {
    const now = new Date();
    const old = new Date(0);
    const { recovery, repository, storage } = setup([
      { key, modifiedAt: now },
      { key: "outside/private.webp", modifiedAt: old },
      { key, modifiedAt: old },
    ]);
    repository.orphanAbsent.mockResolvedValue(false);
    await recovery.runBatch(now);
    expect(repository.byKey).toHaveBeenCalledExactlyOnceWith(`listing/v1/${id}.webp`);
    expect(repository.orphanAbsent).toHaveBeenCalledWith(id, `listing/v1/${id}.webp`);
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it("continues a bounded provider cursor and deletes absent files idempotently", async () => {
    const { recovery, storage } = setup(
      Array.from({ length: 25 }, () => ({ key, modifiedAt: new Date(0) })),
    );
    await recovery.runBatch();
    expect(storage.delete).toHaveBeenCalledTimes(20);
    await recovery.runBatch();
    expect(storage.delete).toHaveBeenCalledTimes(25);
  });
});
