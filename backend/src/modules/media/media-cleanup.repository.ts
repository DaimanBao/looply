import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";
import { queueMediaCleanup } from "./media-cleanup-event";

export class MediaCleanupRepository {
  /** Owns media cleanup queries independently of outbox bookkeeping or User lifecycle rules. */
  constructor(private readonly db: PrismaClient) {}
  /** Resumes expired uploads, including a failed physical deletion already marked DELETING. */
  expired() {
    return this.db.$queryRaw<Array<{ id: string; uploadedById: string }>>`
      SELECT m.id, m."uploadedById" FROM media_assets m
      WHERE m.purpose <> 'CHAT' AND m."listingId" IS NULL AND m."deletedAt" IS NULL
        AND (m.status = 'DELETING' OR (m.status = 'TEMP' AND m."expiresAt" <= clock_timestamp()))
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u."avatarMediaId" = m.id)
        AND NOT EXISTS (SELECT 1 FROM messages msg WHERE msg."imageMediaId" = m.id)
        AND NOT EXISTS (SELECT 1 FROM outbox_events e WHERE e."eventType" = 'media.cleanup'
          AND e."aggregateId" = m."uploadedById" AND e.status <> 'PROCESSED'
          AND e.payload->>'mediaId' = m.id::text)
      ORDER BY m."createdAt", m.id LIMIT 20`;
  }
  /** Deduplicates reconciliation jobs under shared locks; existing outbox leases provide retry/backoff. */
  async enqueue(id: string, userId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await lockResources(tx, [`user:${userId.toLowerCase()}`]);
      await lockResources(tx, [`media:${id.toLowerCase()}`]);
      await queueMediaCleanup(userId, id, tx);
    });
  }
  /** Claims a detached asset while holding the same User lock as attachment. */
  async claim(id: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      await lockResources(tx, [`user:${userId.toLowerCase()}`]);
      await lockResources(tx, [`media:${id.toLowerCase()}`]);
      const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const media = await tx.mediaAsset.findFirst({ where: { id, uploadedById: userId, purpose: { not: "CHAT" }, listingId: null, currentAvatarOf: null, chatMessage: null, deletedAt: null,
        OR: [{ status: "DELETING" }, { status: "TEMP", expiresAt: { lte: now } }, { purpose: "PROFILE", status: "ATTACHED" }] } });
      if (!media) return null;
      if (media.status !== "DELETING" || media.isCover || media.position !== null) await tx.mediaAsset.update({ where: { id }, data: { status: "DELETING", isCover: false, position: null } });
      const [version] = await tx.$queryRaw<Array<{ cleanupVersion: string }>>`SELECT xmin::text AS "cleanupVersion" FROM media_assets WHERE id = ${id}::uuid`;
      if (!version) throw new Error("Missing cleanup claim version");
      return { ...media, cleanupVersion: version.cleanupVersion };
    });
  }
  /** Selects only private account media, protecting both CHAT purpose and any Message reference. */
  privateAssets(userId: string) { return this.db.mediaAsset.findMany({ where: { uploadedById: userId, purpose: { not: "CHAT" }, chatMessage: null, currentAvatarOf: null, deletedAt: null }, select: { id: true } }); }
  /** Resolves inventory objects to canonical metadata, never accepting a key from an HTTP client. */
  byKey(storageKey: string) { return this.db.mediaAsset.findUnique({ where: { storageKey } }); }
  /** Rechecks absence under the reservation's Media lock; server-generated IDs are never reused. */
  async orphanAbsent(id: string, storageKey: string): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      await lockResources(tx, [`media:${id.toLowerCase()}`]);
      return !await tx.mediaAsset.findFirst({ where: { OR: [{ id }, { storageKey }] }, select: { id: true } });
    });
  }
  /** Recovers late writes after a prior cleanup tombstone without reviving any attachment or reference. */
  async recoverTombstone(id: string, userId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await lockResources(tx, [`user:${userId.toLowerCase()}`]);
      await lockResources(tx, [`media:${id.toLowerCase()}`]);
      await tx.mediaAsset.updateMany({ where: { id, uploadedById: userId, status: "DELETING", listingId: null, currentAvatarOf: null, chatMessage: null, purpose: { not: "CHAT" }, deletedAt: { not: null } }, data: { deletedAt: null } });
    });
  }
  /** Runs under the coordinator's User lock; revokes private attachments before any storage operation. */
  async prepareAccount(userId: string, tx: DatabaseTransaction): Promise<void> {
    const candidates = await tx.mediaAsset.findMany({ where: { uploadedById: userId, purpose: { not: "CHAT" }, chatMessage: null, currentAvatarOf: null, deletedAt: null }, select: { id: true, listingId: true } });
    const listingIds = candidates.flatMap((asset) => asset.listingId ? [asset.listingId] : []);
    await lockResources(tx, listingIds.map((id) => `listing:${id.toLowerCase()}`));
    await lockResources(tx, candidates.map((asset) => `media:${asset.id.toLowerCase()}`));
    const foreignListing = await tx.listing.count({ where: { id: { in: listingIds }, ownerId: { not: userId } } });
    if (foreignListing) throw new Error("Unexpected private media ownership");
    await tx.mediaAsset.updateMany({ where: { id: { in: candidates.map((asset) => asset.id) }, currentAvatarOf: null, chatMessage: null, deletedAt: null }, data: { status: "DELETING", listingId: null, position: null, isCover: false } });
  }
  /** Fences completion to the claimed row version; a late writer's abandon must remain eligible for retry. */
  deleted(id: string, userId: string, cleanupVersion: string) {
    return this.db.$transaction(async (tx) => {
      await lockResources(tx, [`user:${userId.toLowerCase()}`]);
      await lockResources(tx, [`media:${id.toLowerCase()}`]);
      const guard = { id, uploadedById: userId, status: "DELETING" as const, listingId: null, purpose: { not: "CHAT" as const }, chatMessage: null, currentAvatarOf: null };
      // Duplicate workers may finish the same generation; an already committed tombstone is success.
      if (await tx.mediaAsset.count({ where: { ...guard, deletedAt: { not: null } } })) return { count: 1 };
      // xmin is a short-lived PostgreSQL MVCC token, never a durable version or public identifier.
      const [current] = await tx.$queryRaw<Array<{ cleanupVersion: string }>>`SELECT xmin::text AS "cleanupVersion" FROM media_assets WHERE id = ${id}::uuid`;
      if (current?.cleanupVersion !== cleanupVersion) return { count: 0 };
      return tx.mediaAsset.updateMany({ where: { ...guard, deletedAt: null }, data: { deletedAt: new Date(), expiresAt: null, isCover: false } });
    });
  }
  /** Refuses account completion if private media remains blocked by an unexpected live reference. */
  pending(userId: string, tx: DatabaseTransaction) { return tx.mediaAsset.count({ where: { uploadedById: userId, purpose: { not: "CHAT" }, chatMessage: null, deletedAt: null } }); }
}
