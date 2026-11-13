import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";
import { queueMediaCleanup } from "./media-cleanup-event";

export class ListingMediaRepository {
  /** Shares transactions with future Listing writers; never owns storage I/O. */
  constructor(private readonly db: PrismaClient) {}
  /** Commits reservations and cancellation independently of physical storage. */
  transaction<T>(run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> { return this.db.$transaction(run); }
  /** Serializes account lifecycle before any Listing or Media lock is acquired. */
  lockUser(userId: string, tx: DatabaseTransaction) { return lockResources(tx, [`user:${userId.toLowerCase()}`]); }
  /** Preserves the approved lock hierarchy; caller must already hold all involved User locks. */
  async lockMedia(ids: string[], tx: DatabaseTransaction, listingId?: string): Promise<void> {
    if (listingId) await lockResources(tx, [`listing:${listingId.toLowerCase()}`]);
    await lockResources(tx, ids.map((id) => `media:${id.toLowerCase()}`));
  }
  /** Uses database wall time after waiting for locks, including expiry exactly at the boundary. */
  async now(tx: DatabaseTransaction): Promise<Date> {
    const [row] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    if (!row) throw new Error("Database clock unavailable");
    return row.now;
  }
  /** Reads ownership and state again inside the mutation transaction. */
  asset(id: string, tx: DatabaseTransaction) { return tx.mediaAsset.findUnique({ where: { id } }); }
  /** Protects all currently implemented reference kinds; future snapshot writers must join this locking protocol. */
  async referenced(id: string, tx: DatabaseTransaction): Promise<boolean> {
    return !!await tx.mediaAsset.findFirst({ where: { id, OR: [{ currentAvatarOf: { isNot: null } }, { chatMessage: { isNot: null } }] }, select: { id: true } });
  }
  /** Reads lifecycle from the locked User rather than trusting a previous request check. */
  user(id: string, tx: DatabaseTransaction) { return tx.user.findUnique({ where: { id } }); }
  /** Keeps Listing authorization at the internal attachment boundary. */
  listing(id: string, tx: DatabaseTransaction) { return tx.listing.findUnique({ where: { id } }); }
  /** Reserves server-generated metadata before the first object is written. */
  reserve(input: { id: string; userId: string; bytes: number; expiresAt: Date }, tx: DatabaseTransaction) {
    return tx.mediaAsset.create({ data: { id: input.id, uploadedById: input.userId, purpose: "LISTING", type: "IMAGE", status: "TEMP", storageKey: `listing/v1/${input.id}.webp`, sizeBytes: input.bytes, mimeType: "image/webp", expiresAt: input.expiresAt } });
  }
  /** Conditional transition also rejects a stale attachment caller even if it bypasses a pre-read. */
  attach(id: string, input: { userId: string; listingId: string; position: number; now: Date }, tx: DatabaseTransaction) {
    return tx.mediaAsset.updateMany({ where: { id, uploadedById: input.userId, purpose: "LISTING", status: "TEMP", listingId: null, deletedAt: null, expiresAt: { gt: input.now } }, data: { status: "ATTACHED", listingId: input.listingId, expiresAt: null, position: input.position } });
  }
  /** Cancellation and its retry event commit together, without a storage side effect. */
  async cancel(id: string, userId: string, tx: DatabaseTransaction): Promise<void> {
    await tx.mediaAsset.update({ where: { id }, data: { status: "DELETING", listingId: null, position: null, isCover: false } });
    await queueMediaCleanup(userId, id, tx);
  }
  /** Reopens a cleanup tombstone after a late writer has settled, so no newly written variant is stranded. */
  async abandon(id: string, userId: string, tx: DatabaseTransaction): Promise<void> {
    await tx.mediaAsset.update({ where: { id }, data: { deletedAt: null } });
    await this.cancel(id, userId, tx);
  }
}
