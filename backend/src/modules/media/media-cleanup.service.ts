import type { DatabaseTransaction } from "../../shared/database/prisma";
import type { ObjectStore } from "./object-store";
import type { MediaCleanupRepository } from "./media-cleanup.repository";
import { mediaObjectKeys } from "./media-object-keys";
import type { MediaOrphanRecovery } from "./media-orphan-recovery.service";

export class MediaCleanupService {
  /** Giữ thao tác storage ngoài transaction trong Media, gọi qua giao diện cleanup công khai. */
  constructor(
    private readonly repository: Pick<
      MediaCleanupRepository,
      "claim" | "deleted" | "expired" | "enqueue" | "privateAssets" | "prepareAccount" | "pending"
    >,
    private readonly storage: ObjectStore,
    private readonly orphans?: MediaOrphanRecovery,
  ) {}

  /** Kiểm tra con trỏ hiện tại trước xóa để avatar cũ trong hàng đợi không xóa tài nguyên hiện tại hoặc Chat. */
  async detached(id: string, userId: string): Promise<void> {
    const media = await this.repository.claim(id, userId);
    if (!media) return;
    // Khóa bất biến và trạng thái kết thúc DELETING giúp bản gửi trùng an toàn cả sau khi lease hết hạn.
    for (const key of mediaObjectKeys(media.storageKey)) await this.storage.delete(key);
    if (!(await this.repository.deleted(id, userId, media.cleanupVersion)).count)
      throw new Error("Media cleanup claim changed; retry required");
  }

  /** Thử lại lô upload hết hạn có giới hạn, không quét/xóa media Chat. */
  async expired(): Promise<void> {
    // Một lỗi I/O không được chặn mọi tài nguyên tiếp theo hoặc lượt quét inventory.
    const results = await Promise.allSettled(
      (await this.repository.expired()).map((media) =>
        this.repository.enqueue(media.id, media.uploadedById),
      ),
    );
    await this.orphans?.runBatch();
    if (results.some((result) => result.status === "rejected"))
      throw new Error("Media cleanup retry required");
  }

  /** Chỉ xóa tài nguyên riêng của tài khoản; bên gọi đã vô hiệu hóa không thể đảo ngược và tách avatar. */
  async account(userId: string): Promise<void> {
    for (const media of await this.repository.privateAssets(userId))
      await this.detached(media.id, userId);
  }

  /** Tách media riêng nguyên tử cùng chuyển trạng thái tài khoản không thể đảo ngược. */
  prepareAccount(userId: string, tx: DatabaseTransaction): Promise<void> {
    return this.repository.prepareAccount(userId, tx);
  }

  /** Kiểm tra hoàn tất trong transaction bộ điều phối trước khi xóa credential và danh tính. */
  async assertAccountClean(userId: string, tx: DatabaseTransaction): Promise<void> {
    if (await this.repository.pending(userId, tx))
      throw new Error("Private media cleanup incomplete");
  }
}
