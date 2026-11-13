import type { DatabaseTransaction } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import type { ListingMediaRepository } from "./listing-media.repository";
import type { ListingMediaService } from "./listing-media.service";
import type { ObjectStore } from "./object-store";
import { listingMediaObjectKeys } from "./media-object-keys";

export type MediaManifest = { imageIds: string[]; coverImageId?: string; videoId: string | null };
export class ListingManifestService {
  /** Owns Media metadata changes; Listing supplies its locked transaction and validated final manifest. */
  constructor(private readonly repository: ListingMediaRepository, private readonly lifecycle: ListingMediaService, private readonly storage: ObjectStore) {}
  /** Locks the union before any write; rollback restores old cover, membership and durable cleanup events. */
  async save(userId: string, listingId: string, manifest: MediaManifest, tx: DatabaseTransaction): Promise<void> {
    const current = await this.repository.members(listingId, tx);
    const finalIds = [...manifest.imageIds, ...(manifest.videoId ? [manifest.videoId] : [])];
    if (manifest.imageIds.length < 1 || manifest.imageIds.length > 5 || new Set(finalIds).size !== finalIds.length || (manifest.coverImageId && !manifest.imageIds.includes(manifest.coverImageId))) throw new AppError(400, "VALIDATION_ERROR", "Invalid media manifest.");
    await this.repository.lockMedia([...current.map((asset) => asset.id), ...finalIds], tx, listingId);
    const fresh: Array<{ id: string; position: number }> = [];
    for (const id of finalIds) {
      const asset = await this.repository.asset(id, tx);
      const expectedType = id === manifest.videoId ? "VIDEO" : "IMAGE";
      if (!asset || asset.uploadedById !== userId || asset.purpose !== "LISTING" || asset.type !== expectedType) throw new AppError(404, "NOT_FOUND", "Media not found.");
      if (await this.repository.referenced(id, tx) || asset.deletedAt) throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Media is unavailable.");
      if (asset.status === "ATTACHED" && asset.listingId === listingId) continue;
      if (asset.status !== "TEMP" || asset.listingId) throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Media is unavailable.");
      if (asset.type === "VIDEO") throw new AppError(503, "MEDIA_VIDEO_UNAVAILABLE", "Video uploads are not available yet.");
      fresh.push({ id, position: manifest.imageIds.indexOf(id) });
    }
    const coverId = manifest.coverImageId ?? current.find((asset) => asset.isCover && manifest.imageIds.includes(asset.id))?.id ?? manifest.imageIds[0];
    await this.repository.clearCover(listingId, tx);
    for (const asset of current) {
      if (finalIds.includes(asset.id)) continue;
      if (asset.uploadedById !== userId || await this.repository.referenced(asset.id, tx)) throw new AppError(409, "MEDIA_REFERENCE_CONFLICT", "Referenced media cannot be removed.");
      await this.repository.cancel(asset.id, userId, tx);
    }
    if (fresh.length) await this.lifecycle.attach({ userId, listingId, assets: fresh }, tx);
    for (const [position, id] of manifest.imageIds.entries()) await this.repository.presentation(id, position, id === coverId, tx);
    if (manifest.videoId) await this.repository.presentation(manifest.videoId, null, false, tx);
  }
  /** Reads a current attachment only; caller holds User/Listing locks and must authorize visibility. */
  async read(input: { listingId: string; id: string; ownerId: string; variant?: "detail" | "thumbnail" | "original"; range: boolean }, tx: DatabaseTransaction): Promise<Buffer> {
    const { listingId, id, variant, range } = input;
    await this.repository.lockMedia([id], tx, listingId);
    const asset = await this.repository.asset(id, tx);
    if (!asset || asset.listingId !== listingId || asset.uploadedById !== input.ownerId || asset.purpose !== "LISTING" || asset.status !== "ATTACHED" || asset.deletedAt) throw new AppError(404, "NOT_FOUND", "Media not found.");
    if (asset.type === "VIDEO") throw new AppError(503, "MEDIA_VIDEO_UNAVAILABLE", "Video delivery is not available yet.");
    if (range) throw new AppError(416, "INVALID_RANGE", "Image ranges are not supported.");
    if (variant === "original") throw new AppError(400, "VALIDATION_ERROR", "Choose an image rendition.", [{ path: "query.variant", code: "custom" }]);
    const keys = listingMediaObjectKeys(asset.storageKey);
    try { return await this.storage.get(keys[variant === "thumbnail" ? 1 : 0]); }
    catch { throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is temporarily unavailable."); }
  }
}
