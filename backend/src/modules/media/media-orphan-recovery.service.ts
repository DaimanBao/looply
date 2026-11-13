import type { MediaCleanupRepository } from "./media-cleanup.repository";
import type { ObjectStore, StoredMediaObject } from "./object-store";

export class MediaOrphanRecovery {
  private inventory?: AsyncGenerator<StoredMediaObject>;

  /** Chỉ dùng inventory local có giới hạn; provider không có inventory vẫn khôi phục TEMP/DELETING trong database. */
  constructor(
    private readonly repository: Pick<
      MediaCleanupRepository,
      "byKey" | "orphanAbsent" | "recoverTombstone"
    >,
    private readonly storage: ObjectStore,
  ) {}

  /** Quét tối đa hai mươi object sinh tự động mỗi nhịp, cũ hơn TTL cộng cả ba lượt ghi có giới hạn. */
  async runBatch(now = new Date()): Promise<void> {
    if (!this.storage.listManaged) return;
    this.inventory ??= this.storage.listManaged();
    try {
      for (let index = 0; index < 20; index++) {
        const entry = await this.inventory.next();
        if (entry.done) {
          this.inventory = undefined;
          break;
        }
        if (entry.value.modifiedAt.getTime() >= now.getTime() - 17 * 60_000) continue;
        await this.reconcile(entry.value.key);
      }
    } catch (error) {
      await this.inventory?.return(undefined);
      this.inventory = undefined;
      throw error;
    }
  }

  /** Chuẩn hóa biến thể được sinh, rồi kiểm tra lại metadata trước khi commit quyền xóa. */
  private async reconcile(key: string): Promise<void> {
    const match =
      /^(profile|listing\/v1)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.thumbnail)?\.(webp|complete|mp4|webm)(?:\.complete)?$/.exec(
        key,
      );
    if (!match) return;
    if (match[1] === "profile" && ["mp4", "webm"].includes(match[3]!)) return;
    const canonical = `${match[1]}/${match[2]}.${match[3] === "mp4" || match[3] === "webm" ? match[3] : "webp"}`;
    const media = await this.repository.byKey(canonical);
    if (media) {
      if (media.deletedAt) await this.repository.recoverTombstone(media.id, media.uploadedById);
      return;
    }
    if (await this.repository.orphanAbsent(match[2]!, canonical)) await this.storage.delete(key);
  }
}
