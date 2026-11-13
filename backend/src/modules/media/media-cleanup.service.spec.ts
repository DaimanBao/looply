import { describe, expect, it, vi } from "vitest";
import { MediaCleanupService } from "./media-cleanup.service";
import type { MediaCleanupRepository } from "./media-cleanup.repository";
import type { ObjectStore } from "./object-store";
import { mediaObjectKeys } from "./media-object-keys";

/** Supplies observable boundaries without simulating PostgreSQL lock or transaction behavior. */
function setup() {
  const repository = {
    claim: vi.fn<MediaCleanupRepository["claim"]>().mockResolvedValue(null),
    deleted: vi.fn<MediaCleanupRepository["deleted"]>().mockResolvedValue({ count: 1 }),
    expired: vi.fn<MediaCleanupRepository["expired"]>().mockResolvedValue([]),
    enqueue: vi.fn<MediaCleanupRepository["enqueue"]>(),
    privateAssets: vi.fn<MediaCleanupRepository["privateAssets"]>().mockResolvedValue([]),
    prepareAccount: vi.fn<MediaCleanupRepository["prepareAccount"]>(),
    pending: vi.fn<MediaCleanupRepository["pending"]>().mockResolvedValue(0),
  };
  const storage = { put: vi.fn<ObjectStore["put"]>(), get: vi.fn<ObjectStore["get"]>(), delete: vi.fn<ObjectStore["delete"]>() };
  return { repository, storage, service: new MediaCleanupService(repository, storage) };
}

describe("Media cleanup orchestration", () => {
  it("does not touch storage when the committed claim refuses an asset", async () => {
    const { service, storage, repository } = setup();
    await service.detached("media", "owner");
    expect(storage.delete).not.toHaveBeenCalled(); expect(repository.deleted).not.toHaveBeenCalled();
  });
  it("routes account cleanup through the same claim boundary", async () => {
    const { service, repository, storage } = setup();
    repository.privateAssets.mockResolvedValue([{ id: "protected" }]);
    await service.account("owner");
    expect(repository.claim).toHaveBeenCalledWith("protected", "owner"); expect(storage.delete).not.toHaveBeenCalled();
  });
  it("derives all versioned renditions without broadening legacy avatar deletion", () => {
    const key = "listing/v1/01234567-89ab-4cde-8fab-0123456789ab.webp";
    expect(mediaObjectKeys(key)).toEqual([key, key.replace(".webp", ".thumbnail.webp"), key.replace(".webp", ".complete")]);
    expect(mediaObjectKeys("profile/opaque.webp")).toEqual(["profile/opaque.webp"]);
    expect(() => mediaObjectKeys("listing/v1/../../private.webp")).toThrow();
  });
});
