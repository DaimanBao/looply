import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { queueMediaCleanup } from "./media-cleanup-event";

export class MediaRepository {
  /** Dùng chung pool và transaction client với thay đổi User. */
  constructor(private readonly db: PrismaClient) {}

  /** Lưu metadata tạm có thể khôi phục trước khi thử ghi storage ngoài transaction. */
  temporary(
    id: string,
    userId: string,
    storageKey: string,
    bytes: number,
    tx: DatabaseTransaction,
  ) {
    return tx.mediaAsset.create({
      data: {
        id,
        uploadedById: userId,
        purpose: "PROFILE",
        type: "IMAGE",
        storageKey,
        mimeType: "image/webp",
        sizeBytes: bytes,
        status: "TEMP",
        expiresAt: new Date(Date.now() + 15 * 60000),
      },
    });
  }

  /** Chỉ nhận upload tạm chưa hết hạn từ chủ sở hữu. */
  attach(id: string, userId: string, tx: DatabaseTransaction) {
    return tx.mediaAsset.updateMany({
      where: {
        id,
        uploadedById: userId,
        purpose: "PROFILE",
        status: "TEMP",
        expiresAt: { gt: new Date() },
        deletedAt: null,
      },
      data: { status: "ATTACHED", expiresAt: null },
    });
  }

  /** Dùng outbox bền vững hiện có để cleanup khi tách, không sao chép khóa hoặc PII vào sự kiện. */
  queueCleanup(userId: string, mediaId: string, tx: DatabaseTransaction) {
    return queueMediaCleanup(userId, mediaId, tx);
  }

  /** Chỉ trả ảnh hồ sơ đang dùng, còn hiệu lực, thuộc sở hữu; không tìm tài nguyên tùy ý qua storage key được cung cấp. */
  currentAvatar(userId: string) {
    return this.db.mediaAsset.findFirst({
      where: {
        currentAvatarOf: { id: userId },
        uploadedById: userId,
        purpose: "PROFILE",
        type: "IMAGE",
        status: "ATTACHED",
        deletedAt: null,
      },
    });
  }
}
