import type { DatabaseTransaction } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import type { ListingMediaRepository } from "./listing-media.repository";
import type { ListingMediaService } from "./listing-media.service";
import type { ObjectStore } from "./object-store";
import { listingMediaObjectKeys, videoObjectKeys } from "./media-object-keys";
import type { Readable } from "node:stream";
import { videoRange } from "./video-range";

export type MediaManifest = { imageIds: string[]; coverImageId?: string; videoId: string | null };
export type MediaDelivery = {
  body: Buffer | Readable | null;
  status: 200 | 206 | 416;
  length: number;
  mimeType: string;
  contentRange?: string;
  acceptRanges: "bytes" | "none";
};
export class ListingManifestService {
  /** Quản lý thay đổi metadata Media; Listing cung cấp transaction đã khóa và manifest cuối đã kiểm tra. */
  constructor(
    private readonly repository: ListingMediaRepository,
    private readonly lifecycle: ListingMediaService,
    private readonly storage: ObjectStore,
  ) {}

  /** Khóa tập hợp trước mọi ghi; rollback khôi phục cover, thành viên cũ và sự kiện cleanup bền vững. */
  async save(
    userId: string,
    listingId: string,
    manifest: MediaManifest,
    tx: DatabaseTransaction,
  ): Promise<void> {
    const current = await this.repository.members(listingId, tx);
    const finalAssets: Array<{ id: string; position: number | null }> = manifest.imageIds.map(
      (id, position) => ({ id, position }),
    );
    if (manifest.videoId) finalAssets.push({ id: manifest.videoId, position: null });
    const finalIds = finalAssets.map((asset) => asset.id);
    if (
      manifest.imageIds.length < 1 ||
      manifest.imageIds.length > 5 ||
      new Set(finalIds).size !== finalIds.length ||
      (manifest.coverImageId && !manifest.imageIds.includes(manifest.coverImageId))
    )
      throw new AppError(400, "VALIDATION_ERROR", "Invalid media manifest.");
    await this.repository.lockMedia(
      [...current.map((asset) => asset.id), ...finalIds],
      tx,
      listingId,
    );
    const fresh: Array<{ id: string; position: number | null }> = [];
    // Duyệt đúng thứ tự ảnh rồi video để giữ lỗi đầu tiên của manifest.
    for (const entry of finalAssets) {
      const asset = await this.repository.asset(entry.id, tx);
      const expectedType = entry.position === null ? "VIDEO" : "IMAGE";
      if (
        !asset ||
        asset.uploadedById !== userId ||
        asset.purpose !== "LISTING" ||
        asset.type !== expectedType
      )
        throw new AppError(404, "NOT_FOUND", "Media not found.");
      if ((await this.repository.referenced(entry.id, tx)) || asset.deletedAt)
        throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Media is unavailable.");
      if (asset.status === "ATTACHED" && asset.listingId === listingId) continue;
      if (asset.status !== "TEMP" || asset.listingId)
        throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Media is unavailable.");
      fresh.push(entry);
    }
    const coverId =
      manifest.coverImageId ??
      current.find((asset) => asset.isCover && manifest.imageIds.includes(asset.id))?.id ??
      manifest.imageIds[0];
    await this.repository.clearCover(listingId, tx);
    for (const asset of current) {
      if (finalIds.includes(asset.id)) continue;
      if (asset.uploadedById !== userId || (await this.repository.referenced(asset.id, tx)))
        throw new AppError(409, "MEDIA_REFERENCE_CONFLICT", "Referenced media cannot be removed.");
      await this.repository.cancel(asset.id, userId, tx);
    }
    if (fresh.length) await this.lifecycle.attach({ userId, listingId, assets: fresh }, tx);
    for (const { id, position } of finalAssets)
      await this.repository.presentation(id, position, position !== null && id === coverId, tx);
  }

  /** Chỉ đọc đính kèm hiện tại; bên gọi giữ khóa User/Listing và phải cấp quyền hiển thị. */
  async read(
    input: {
      listingId: string;
      id: string;
      ownerId: string;
      variant?: "detail" | "thumbnail" | "original";
      range?: string;
      ifRange?: boolean;
    },
    tx: DatabaseTransaction,
  ): Promise<MediaDelivery> {
    const { listingId, id, variant, range } = input;
    await this.repository.lockMedia([id], tx, listingId);
    const asset = await this.repository.asset(id, tx);
    if (
      !asset ||
      asset.listingId !== listingId ||
      asset.uploadedById !== input.ownerId ||
      asset.purpose !== "LISTING" ||
      asset.status !== "ATTACHED" ||
      asset.deletedAt
    )
      throw new AppError(404, "NOT_FOUND", "Media not found.");
    if (asset.type === "VIDEO") {
      if (variant && variant !== "original")
        throw new AppError(400, "VALIDATION_ERROR", "Choose the original video.", [
          { path: "query.variant", code: "custom" },
        ]);
      if (!this.storage.size || !this.storage.readRange)
        throw new AppError(503, "MEDIA_UNAVAILABLE", "Video storage is unavailable.");
      const [key] = videoObjectKeys(asset.storageKey);
      const size = Number(asset.sizeBytes);
      if (!Number.isSafeInteger(size) || size < 1 || size > 100 * 1024 * 1024)
        throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is temporarily unavailable.");
      let interval;
      try {
        interval = videoRange(input.ifRange ? undefined : range, size);
      } catch {
        return {
          body: null,
          status: 416,
          length: 0,
          mimeType: asset.mimeType,
          contentRange: `bytes */${size}`,
          acceptRanges: "bytes",
        };
      }
      try {
        if ((await this.storage.size(key)) !== size) throw new Error("Incomplete stored video");
        const body = await this.storage.readRange(key, interval.start, interval.end);
        // Lỗi mạng/file có thể đến lúc transaction phân quyền đang commit, trước khi nối luồng HTTP.
        body.on("error", () => {});
        return {
          body,
          status: interval.partial ? 206 : 200,
          length: interval.end - interval.start + 1,
          mimeType: asset.mimeType,
          acceptRanges: "bytes",
          ...(interval.partial
            ? { contentRange: `bytes ${interval.start}-${interval.end}/${size}` }
            : {}),
        };
      } catch {
        throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is temporarily unavailable.");
      }
    }
    if (range !== undefined)
      throw new AppError(416, "INVALID_RANGE", "Image ranges are not supported.");
    if (variant === "original")
      throw new AppError(400, "VALIDATION_ERROR", "Choose an image rendition.", [
        { path: "query.variant", code: "custom" },
      ]);
    const keys = listingMediaObjectKeys(asset.storageKey);
    try {
      const body = await this.storage.get(keys[variant === "thumbnail" ? 1 : 0]);
      return {
        body,
        status: 200,
        length: body.length,
        mimeType: "image/webp",
        acceptRanges: "none",
      };
    } catch {
      throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is temporarily unavailable.");
    }
  }
}
