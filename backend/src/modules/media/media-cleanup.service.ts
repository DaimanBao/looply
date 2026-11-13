import type { DatabaseTransaction } from "../../shared/database/prisma";
import type { ObjectStore } from "./object-store";
import type { MediaCleanupRepository } from "./media-cleanup.repository";

export class MediaCleanupService {
  /** Keeps nontransactional storage operations in Media, callable through its public cleanup boundary. */
  constructor(private readonly repository: MediaCleanupRepository, private readonly storage: ObjectStore) {}
  /** Rechecks current pointers before deletion, so a queued old avatar cannot remove a current or Chat asset. */
  async detached(id: string, userId: string): Promise<void> {
    const media = await this.repository.claim(id, userId);
    if (!media) return;
    await this.storage.delete(media.storageKey); await this.repository.deleted(id);
  }
  /** Retries bounded batches of expired uploads without ever scanning/deleting Chat media. */
  async expired(): Promise<void> { for (const media of await this.repository.expired()) await this.detached(media.id, media.uploadedById); }
  /** Deletes only account-private assets; caller has already irreversibly disabled that account and detached its avatar. */
  async account(userId: string): Promise<void> {
    for (const media of await this.repository.privateAssets(userId)) { await this.storage.delete(media.storageKey); await this.repository.deleted(media.id); }
  }
  /** Checks completion in the coordinator's transaction before credentials and identity are erased. */
  async assertAccountClean(userId: string, tx: DatabaseTransaction): Promise<void> {
    if (await this.repository.pending(userId, tx)) throw new Error("Private media cleanup incomplete");
  }
}
