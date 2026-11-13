import type { MediaCleanupRepository } from "./media-cleanup.repository";
import type { ObjectStore, StoredMediaObject } from "./object-store";

export class MediaOrphanRecovery {
  private inventory?: AsyncGenerator<StoredMediaObject>;
  /** Uses local bounded inventory only; providers without inventory still recover database TEMP/DELETING. */
  constructor(private readonly repository: Pick<MediaCleanupRepository, "byKey" | "orphanAbsent" | "recoverTombstone">, private readonly storage: ObjectStore) {}
  /** Scans at most twenty generated objects per tick, older than TTL plus all three bounded writes. */
  async runBatch(now = new Date()): Promise<void> {
    if (!this.storage.listManaged) return;
    this.inventory ??= this.storage.listManaged();
    try {
      for (let index = 0; index < 20; index++) {
        const entry = await this.inventory.next();
        if (entry.done) { this.inventory = undefined; break; }
        if (entry.value.modifiedAt.getTime() >= now.getTime() - 17 * 60_000) continue;
        await this.reconcile(entry.value.key);
      }
    } catch (error) {
      await this.inventory?.return(undefined);
      this.inventory = undefined;
      throw error;
    }
  }
  /** Canonicalizes generated variants, then rechecks metadata before committing permission to delete. */
  private async reconcile(key: string): Promise<void> {
    const match = /^(profile|listing\/v1)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.thumbnail)?\.(?:webp|complete)$/.exec(key);
    if (!match) return;
    const canonical = `${match[1]}/${match[2]}.webp`;
    const media = await this.repository.byKey(canonical);
    if (media) {
      if (media.deletedAt) await this.repository.recoverTombstone(media.id, media.uploadedById);
      return;
    }
    if (await this.repository.orphanAbsent(match[2]!, canonical)) await this.storage.delete(key);
  }
}
