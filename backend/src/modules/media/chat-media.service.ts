import { randomUUID } from "node:crypto";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";
import { AppError } from "../../shared/errors/app-error";
import { optimizeListingImage } from "./listing-image";
import { listingMediaObjectKeys } from "./media-object-keys";
import type { ObjectStore, StoredMediaObject } from "./object-store";
import type { ChatMediaRepository } from "./chat-media.repository";

export class ChatMediaService {
  private inventory?: AsyncGenerator<StoredMediaObject>;
  /** Tái sử dụng processor ảnh và private ObjectStore; Chat không xây upload/storage pipeline khác. */
  constructor(
    private readonly repository: ChatMediaRepository,
    private readonly storage: ObjectStore,
  ) {}

  /** Xử lý cùng quy tắc JPG/PNG/WebP 10 MiB, loại metadata và giới hạn pixel như Listing. */
  async optimize(input: Buffer) {
    try {
      return await optimizeListingImage(input);
    } catch (error) {
      if (error instanceof AppError && error.code === "MEDIA_VIDEO_UNAVAILABLE")
        throw new AppError(
          415,
          "UNSUPPORTED_MEDIA",
          "Chat only supports JPEG, PNG or WebP images.",
        );
      throw error;
    }
  }

  /** Reservation có Conversation cụ thể và uploader; chỉ ghi metadata đã kiểm tra. */
  reserve(
    userId: string,
    conversationId: string,
    size: number,
    now: Date,
    tx: DatabaseTransaction,
  ) {
    const id = randomUUID();
    return this.repository.create(
      {
        id,
        uploadedById: userId,
        chatConversationId: conversationId,
        purpose: "CHAT",
        type: "IMAGE",
        status: "TEMP",
        storageKey: `chat/${id}.webp`,
        mimeType: "image/webp",
        sizeBytes: size,
        expiresAt: new Date(now.getTime() + 900_000),
      },
      tx,
    );
  }

  /** Object bất biến; ghi muộn sẽ được worker đối soát từ tombstone của cùng ID. */
  async write(id: string, bytes: Buffer, userId: string): Promise<void> {
    try {
      await this.storage.put(`chat/${id}.webp`, bytes);
    } catch (error) {
      await this.repository.abandon(id, userId);
      throw error;
    }
  }

  /** Recheck sau ghi để không trả ID đã hết hạn hoặc bị cleanup trong lúc storage chậm. */
  async ready(id: string, userId: string, tx: DatabaseTransaction): Promise<void> {
    await lockResources(tx, [`media:${id}`]);
    const asset = await this.repository.get(id, tx);
    if (
      !asset ||
      asset.uploadedById !== userId ||
      asset.status !== "TEMP" ||
      asset.deletedAt ||
      !asset.expiresAt ||
      asset.expiresAt <= (await this.repository.now(tx))
    )
      throw new AppError(409, "UPLOAD_EXPIRED", "Upload the image again.");
  }

  /** Hoàn tất ghi muộn luôn mở lại cleanup, không làm sống lại attachment. */
  abandon(id: string, userId: string) {
    return this.repository.abandon(id, userId);
  }

  /** Chỉ attach ảnh đúng uploader và Conversation, còn TEMP và chưa quá hạn sau chờ storage. */
  async attach(
    id: string,
    userId: string,
    conversationId: string,
    tx: DatabaseTransaction,
  ): Promise<void> {
    await lockResources(tx, [`media:${id}`]);
    const asset = await this.repository.get(id, tx);
    if (
      !asset ||
      asset.purpose !== "CHAT" ||
      asset.type !== "IMAGE" ||
      asset.chatConversationId !== conversationId ||
      asset.uploadedById !== userId
    )
      throw new AppError(404, "NOT_FOUND", "Image not found.");
    const bytes = await this.readAsset(id, conversationId, tx, false);
    if (BigInt(bytes.length) !== asset.sizeBytes)
      throw new AppError(503, "MEDIA_UNAVAILABLE", "Image is unavailable.");
    const now = await this.repository.now(tx);
    if (asset.status !== "TEMP" || asset.deletedAt || !asset.expiresAt || asset.expiresAt <= now)
      throw new AppError(409, "UPLOAD_EXPIRED", "Upload the image again.");
    await this.repository.update(id, { status: "ATTACHED", expiresAt: null }, tx);
  }

  /** Đọc ảnh Message còn attached; không lấy điều kiện User uploader để bảo toàn lịch sử. */
  async readAsset(
    id: string,
    conversationId: string,
    tx: DatabaseTransaction,
    attached = true,
  ): Promise<Buffer> {
    const asset = await this.repository.get(id, tx);
    if (
      !asset ||
      asset.purpose !== "CHAT" ||
      asset.type !== "IMAGE" ||
      asset.chatConversationId !== conversationId ||
      asset.deletedAt ||
      (attached && asset.status !== "ATTACHED")
    )
      throw new AppError(404, "NOT_FOUND", "Image not found.");
    try {
      return await this.storage.get(asset.storageKey);
    } catch {
      throw new AppError(503, "MEDIA_UNAVAILABLE", "Image is temporarily unavailable.");
    }
  }

  /** Hủy upload đúng chủ; attached ảnh đã gửi không thể bị xóa qua endpoint TEMP. */
  async cancel(
    id: string,
    userId: string,
    conversationId: string,
    tx: DatabaseTransaction,
  ): Promise<void> {
    await lockResources(tx, [`media:${id}`]);
    const asset = await this.repository.get(id, tx);
    if (
      !asset ||
      asset.uploadedById !== userId ||
      asset.purpose !== "CHAT" ||
      asset.chatConversationId !== conversationId
    )
      throw new AppError(404, "NOT_FOUND", "Image not found.");
    if (asset.status === "ATTACHED")
      throw new AppError(409, "MEDIA_ATTACHED", "The image has already been sent.");
    await this.repository.update(id, { status: "DELETING", deletedAt: null }, tx);
  }

  /** Copy thumbnail bytes sang key riêng; không để snapshot phụ thuộc object cover Listing. */
  async copySnapshot(
    source: { id: string; storageKey: string },
    snapshotId: string,
  ): Promise<number> {
    const bytes = await this.storage.get(listingMediaObjectKeys(source.storageKey)[1]);
    if (!bytes.length)
      throw new AppError(503, "MEDIA_UNAVAILABLE", "Listing cover is unavailable.");
    await this.storage.put(`chat-snapshot/${snapshotId}.webp`, bytes);
    return bytes.length;
  }

  /** Snapshot ID server xác định key riêng, không nhận key từ HTTP. */
  readSnapshot(id: string): Promise<Buffer> {
    return this.storage.get(`chat-snapshot/${id}.webp`);
  }

  /** Xóa vật lý idempotent sau khi Chat đã thu hồi quyền phục vụ bằng trạng thái. */
  deleteSnapshot(id: string): Promise<void> {
    return this.storage.delete(`chat-snapshot/${id}.webp`);
  }

  /** Chat sở hữu metadata snapshot; Media chỉ cấp inventory private có giới hạn khi provider hỗ trợ. */
  snapshotInventory() {
    return this.storage.listManaged?.(["chat-snapshot"]);
  }

  /** Đối soát local object ghi muộn sau crash, không xóa asset còn được Message tham chiếu. */
  private async reconcileUploads(): Promise<void> {
    if (!this.storage.listManaged) return;
    this.inventory ??= this.storage.listManaged(["chat"]);
    for (let index = 0; index < 20; index++) {
      const entry = await this.inventory.next();
      if (entry.done) {
        this.inventory = undefined;
        break;
      }
      const match = /^chat\/([0-9a-f-]{36})\.webp$/.exec(entry.value.key);
      if (!match || entry.value.modifiedAt.getTime() >= Date.now() - 17 * 60_000) continue;
      const asset = await this.repository.byKey(entry.value.key);
      if (!asset) await this.storage.delete(entry.value.key);
      else if (asset.deletedAt) await this.repository.abandon(asset.id, asset.uploadedById);
    }
  }

  /** Cleanup TEMP CHAT theo batch; attached ảnh lịch sử không nằm trong tập này. */
  async cleanupUploads(): Promise<boolean> {
    await this.reconcileUploads();
    const rows = await this.repository.expired();
    let failed = false;
    for (const candidate of rows) {
      try {
        const current = await this.repository.claim(candidate);
        if (!current) continue;
        await this.storage.delete(current.storageKey);
        await this.repository.deleted(current.id, current.uploadedById, current.cleanupVersion);
      } catch {
        failed = true;
      }
    }
    if (failed) throw new Error("CHAT_UPLOAD_CLEANUP_RETRY");
    return rows.length > 0;
  }
}
