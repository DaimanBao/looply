import type { DatabaseTransaction } from "../../shared/database/prisma";
import type { ObjectStore } from "./object-store";
import type { MediaCleanupRepository } from "./media-cleanup.repository";
import { mediaObjectKeys } from "./media-object-keys";
import type { MediaOrphanRecovery } from "./media-orphan-recovery.service";

export class MediaCleanupService {
  /** Keeps nontransactional storage operations in Media, callable through its public cleanup boundary. */
  constructor(private readonly repository: Pick<MediaCleanupRepository, "claim" | "deleted" | "expired" | "enqueue" | "privateAssets" | "prepareAccount" | "pending">, private readonly storage: ObjectStore, private readonly orphans?: MediaOrphanRecovery) {}
  /** Rechecks current pointers before deletion, so a queued old avatar cannot remove a current or Chat asset. */
  async detached(id: string, userId: string): Promise<void> {
    const media = await this.repository.claim(id, userId);
    if (!media) return;
    // Immutable keys and terminal DELETING make duplicate deliveries safe even after a lease expires.
    for (const key of mediaObjectKeys(media.storageKey)) await this.storage.delete(key);
    if (!(await this.repository.deleted(id, userId, media.cleanupVersion)).count) throw new Error("Media cleanup claim changed; retry required");
  }
  /** Retries bounded batches of expired uploads without ever scanning/deleting Chat media. */
  async expired(): Promise<void> {
    // One I/O failure must not starve every later asset or the inventory sweep.
    const results = await Promise.allSettled((await this.repository.expired()).map((media) => this.repository.enqueue(media.id, media.uploadedById)));
    await this.orphans?.runBatch();
    if (results.some((result) => result.status === "rejected")) throw new Error("Media cleanup retry required");
  }
  /** Deletes only account-private assets; caller has already irreversibly disabled that account and detached its avatar. */
  async account(userId: string): Promise<void> {
    for (const media of await this.repository.privateAssets(userId)) await this.detached(media.id, userId);
  }
  /** Detaches private account media atomically with the irreversible account transition. */
  prepareAccount(userId: string, tx: DatabaseTransaction): Promise<void> { return this.repository.prepareAccount(userId, tx); }
  /** Checks completion in the coordinator's transaction before credentials and identity are erased. */
  async assertAccountClean(userId: string, tx: DatabaseTransaction): Promise<void> {
    if (await this.repository.pending(userId, tx)) throw new Error("Private media cleanup incomplete");
  }
}
