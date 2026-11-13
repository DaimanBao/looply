import { randomUUID } from "node:crypto";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import type { ObjectStore } from "./object-store";
import type { ListingMediaRepository } from "./listing-media.repository";
import { listingMediaObjectKeys, videoObjectKeys } from "./media-object-keys";
import type { ValidatedVideo } from "./listing-video";

export class ListingMediaService {
  /** Dùng chung vòng đời media cho quản lý Listing và upload có xác thực. */
  constructor(
    private readonly repository: ListingMediaRepository,
    private readonly storage: ObjectStore,
  ) {}

  /** Đặt trước media có hạn từ đầu ra processor/inspector tin cậy, không từ metadata client. */
  async reserve(
    userId: string,
    sizeBytes: number,
    video?: ValidatedVideo,
  ): Promise<{ id: string; expiresAt: Date }> {
    if (
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes <= 0 ||
      sizeBytes > (video ? 100 : 10) * 1024 * 1024 ||
      (video &&
        (!Number.isInteger(video.durationSeconds) ||
          video.durationSeconds < 1 ||
          video.durationSeconds > 180))
    )
      throw new Error("Invalid processed media size/duration");
    return this.repository.transaction(async (tx) => {
      await this.repository.lockUser(userId, tx);
      await this.requireActive(userId, tx);
      const now = await this.repository.now(tx);
      const id = randomUUID();
      const expiresAt = new Date(now.getTime() + 15 * 60_000);
      await this.repository.reserve({ id, userId, bytes: sizeBytes, expiresAt, video }, tx);
      return { id, expiresAt };
    });
  }

  /** Công bố video gốc đã kiểm tra rồi trạng thái sẵn sàng theo cùng giao thức khóa User/Media của ảnh. */
  async writeVideo(id: string, userId: string, video: ValidatedVideo): Promise<void> {
    if (!this.storage.putFile || !this.storage.size)
      throw new AppError(503, "MEDIA_VIDEO_UNAVAILABLE", "Video storage is unavailable.");
    const key = await this.repository.transaction(async (tx) => {
      await this.repository.lockUser(userId, tx);
      await this.repository.lockMedia([id], tx);
      await this.requireActive(userId, tx);
      const asset = await this.repository.asset(id, tx);
      if (
        !asset ||
        asset.uploadedById !== userId ||
        asset.type !== "VIDEO" ||
        asset.purpose !== "LISTING" ||
        asset.status !== "TEMP" ||
        asset.deletedAt ||
        !asset.expiresAt ||
        asset.expiresAt <= (await this.repository.now(tx)) ||
        asset.sizeBytes !== BigInt(video.sizeBytes) ||
        asset.mimeType !== video.mimeType ||
        asset.durationSeconds !== video.durationSeconds
      )
        throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Upload is no longer available.");
      return videoObjectKeys(asset.storageKey);
    });
    try {
      await this.storage.putFile(key[0], video.path, video.mimeType, video.sizeBytes);
      await this.repository.transaction(async (tx) => {
        await this.repository.lockUser(userId, tx);
        await this.repository.lockMedia([id], tx);
        await this.requireActive(userId, tx);
        const asset = await this.repository.asset(id, tx);
        if (
          !asset ||
          asset.status !== "TEMP" ||
          asset.deletedAt ||
          !asset.expiresAt ||
          asset.expiresAt <= (await this.repository.now(tx))
        )
          throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Upload is no longer available.");
        await this.storage.put(key[1], Buffer.from("looply-video-v1"), "application/octet-stream");
      });
    } catch (error) {
      await this.repository.transaction(async (tx) => {
        await this.repository.lockUser(userId, tx);
        await this.repository.lockMedia([id], tx);
        const asset = await this.repository.asset(id, tx);
        if (asset && asset.status !== "ATTACHED") await this.repository.abandon(id, userId, tx);
      });
      throw error instanceof AppError
        ? error
        : new AppError(503, "MEDIA_UNAVAILABLE", "Video storage is temporarily unavailable.");
    }
  }

  /** Chỉ ghi đầu ra xử lý vào khóa đã đặt trước; công bố sẵn sàng cuối cùng dưới khóa chung. */
  async write(
    id: string,
    userId: string,
    images: { detail: Buffer; thumbnail: Buffer },
  ): Promise<void> {
    const media = await this.repository.transaction(async (tx) => {
      await this.repository.lockUser(userId, tx);
      await this.repository.lockMedia([id], tx);
      await this.requireActive(userId, tx);
      const asset = await this.repository.asset(id, tx);
      if (
        !asset ||
        asset.uploadedById !== userId ||
        asset.purpose !== "LISTING" ||
        asset.type !== "IMAGE"
      )
        throw new AppError(404, "NOT_FOUND", "Media not found.");
      const now = await this.repository.now(tx);
      if (
        asset.status !== "TEMP" ||
        asset.deletedAt ||
        !asset.expiresAt ||
        asset.expiresAt <= now ||
        asset.sizeBytes !== BigInt(images.detail.length) ||
        !images.thumbnail.length
      )
        throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Upload is no longer available.");
      return asset;
    });
    const keys = listingMediaObjectKeys(media.storageKey);
    try {
      await this.storage.put(keys[0], images.detail);
      await this.storage.put(keys[1], images.thumbnail);
      await this.repository.transaction(async (tx) => {
        await this.repository.lockUser(userId, tx);
        await this.repository.lockMedia([id], tx);
        await this.requireActive(userId, tx);
        const current = await this.repository.asset(id, tx);
        const now = await this.repository.now(tx);
        if (
          !current ||
          current.status !== "TEMP" ||
          current.deletedAt ||
          !current.expiresAt ||
          current.expiresAt <= now
        )
          throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Upload is no longer available.");
        await this.storage.put(keys[2], Buffer.from("looply-listing-v1"));
      });
    } catch (error) {
      // Mọi lượt ghi đã kết thúc. Đối soát ngay cả khi cleanup đã xóa object gốc của metadata.
      await this.repository.transaction(async (tx) => {
        await this.repository.lockUser(userId, tx);
        await this.repository.lockMedia([id], tx);
        const current = await this.repository.asset(id, tx);
        if (current && current.status !== "ATTACHED") await this.repository.abandon(id, userId, tx);
      });
      throw error;
    }
  }

  /** Từ chối đính kèm cho đến khi server hoàn tất bền vững các bản ảnh hoặc video gốc. */
  private async requireReady(key: string, sizeBytes: bigint): Promise<void> {
    try {
      if (/\.(mp4|webm)$/.test(key)) {
        const keys = videoObjectKeys(key);
        if (
          !this.storage.size ||
          !(await this.storage.get(keys[1])).equals(Buffer.from("looply-video-v1")) ||
          BigInt(await this.storage.size(keys[0])) !== sizeBytes
        )
          throw new Error("Incomplete video");
        return;
      }
      const keys = listingMediaObjectKeys(key);
      const marker = await this.storage.get(keys[2]);
      if (!marker.equals(Buffer.from("looply-listing-v1")))
        throw new Error("Invalid completion marker");
      const detail = await this.storage.get(keys[0]);
      const thumbnail = await this.storage.get(keys[1]);
      if (BigInt(detail.length) !== sizeBytes || !thumbnail.length)
        throw new Error("Incomplete renditions");
    } catch {
      throw new AppError(409, "MEDIA_NOT_READY", "Upload is not ready.");
    }
  }

  /** Đính kèm trong transaction Listing của bên gọi; bên gọi kiểm tra gallery/cover cuối và giữ mọi khóa User trước. */
  async attach(
    input: {
      assets: Array<{ id: string; position: number | null }>;
      userId: string;
      listingId: string;
    },
    tx: DatabaseTransaction,
  ): Promise<void> {
    const images = input.assets.filter((asset) => asset.position !== null);
    if (
      !input.assets.length ||
      input.assets.length > 6 ||
      images.length > 5 ||
      input.assets.length - images.length > 1 ||
      new Set(input.assets.map((asset) => asset.id)).size !== input.assets.length ||
      new Set(images.map((asset) => asset.position)).size !== images.length ||
      images.some((asset) => !Number.isSafeInteger(asset.position) || asset.position! < 0)
    )
      throw new AppError(400, "VALIDATION_ERROR", "Invalid media attachments.");
    await this.repository.lockUser(input.userId, tx);
    await this.repository.lockMedia(
      input.assets.map((asset) => asset.id),
      tx,
      input.listingId,
    );
    await this.requireActive(input.userId, tx);
    const listing = await this.repository.listing(input.listingId, tx);
    if (!listing || listing.ownerId !== input.userId || listing.status === "DELETED")
      throw new AppError(404, "NOT_FOUND", "Listing not found.");
    for (const asset of input.assets)
      await this.attachAsset({ ...asset, userId: input.userId, listingId: input.listingId }, tx);
  }

  /** Kiểm tra một ảnh sau khi giữ khóa cả lô; lỗi sau đó rollback mọi đính kèm. */
  private async attachAsset(
    input: { id: string; userId: string; listingId: string; position: number | null },
    tx: DatabaseTransaction,
  ): Promise<void> {
    const media = await this.repository.asset(input.id, tx);
    if (
      !media ||
      media.uploadedById !== input.userId ||
      media.purpose !== "LISTING" ||
      media.type !== (input.position === null ? "VIDEO" : "IMAGE")
    )
      throw new AppError(404, "NOT_FOUND", "Media not found.");
    const now = await this.repository.now(tx);
    if (
      media.status !== "TEMP" ||
      media.listingId ||
      media.deletedAt ||
      !media.expiresAt ||
      media.expiresAt <= now ||
      (await this.repository.referenced(media.id, tx))
    )
      throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Upload is no longer available.");
    await this.requireReady(media.storageKey, media.sizeBytes);
    // Kiểm tra lại thời gian sau I/O storage có giới hạn; upload có thể hết hạn trong lúc kiểm tra.
    if (
      (await this.repository.attach(input.id, { ...input, now: await this.repository.now(tx) }, tx))
        .count !== 1
    )
      throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Upload is no longer available.");
  }

  /** Chỉ hủy tài nguyên TEMP của người upload đã xác thực; thử lại trạng thái kết thúc không tạo job trùng. */
  async cancel(id: string, userId: string): Promise<void> {
    await this.repository.transaction((tx) => this.cancelInTransaction(id, userId, tx));
  }

  /** Cho phép hủy qua HTTP kiểm tra lại phiên trong cùng transaction đã khóa với chuyển trạng thái. */
  async cancelInTransaction(id: string, userId: string, tx: DatabaseTransaction): Promise<void> {
    await this.repository.lockUser(userId, tx);
    await this.repository.lockMedia([id], tx);
    await this.requireActive(userId, tx);
    const media = await this.repository.asset(id, tx);
    if (!media || media.uploadedById !== userId || media.purpose !== "LISTING")
      throw new AppError(404, "NOT_FOUND", "Media not found.");
    if (media.status === "DELETING" || media.deletedAt) return;
    if (
      media.status === "ATTACHED" ||
      media.listingId ||
      (await this.repository.referenced(id, tx))
    )
      throw new AppError(409, "MEDIA_ALREADY_ATTACHED", "Media is already attached.");
    await this.repository.cancel(id, userId, tx);
  }

  /** Chặn mọi ghi nội bộ khi tài khoản bị xóa, kể cả khi không qua middleware HTTP. */
  private async requireActive(userId: string, tx: DatabaseTransaction): Promise<void> {
    if ((await this.repository.user(userId, tx))?.status !== "ACTIVE")
      throw new AppError(403, "ACCOUNT_NOT_ACTIVE", "Account is not active.");
  }
}
