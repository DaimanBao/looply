import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";

export class MediaCleanupRepository {
  /** Owns media cleanup queries independently of outbox bookkeeping or User lifecycle rules. */
  constructor(private readonly db: PrismaClient) {}
  /** Resumes expired uploads, including a failed physical deletion already marked DELETING. */
  expired() { return this.db.mediaAsset.findMany({ where: { purpose: { not: "CHAT" }, status: { in: ["TEMP", "DELETING"] }, expiresAt: { lte: new Date() }, deletedAt: null, currentAvatarOf: null, chatMessage: null }, select: { id: true, uploadedById: true }, take: 20 }); }
  /** Claims a detached asset while holding the same User lock as attachment. */
  async claim(id: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      await lockResources(tx, [`user:${userId.toLowerCase()}`]);
      const media = await tx.mediaAsset.findFirst({ where: { id, uploadedById: userId, purpose: { not: "CHAT" }, currentAvatarOf: null, chatMessage: null, deletedAt: null } });
      if (!media) return null;
      await tx.mediaAsset.update({ where: { id }, data: { status: "DELETING", isCover: false } });
      return media;
    });
  }
  /** Selects only private account media, protecting both CHAT purpose and any Message reference. */
  privateAssets(userId: string) { return this.db.mediaAsset.findMany({ where: { uploadedById: userId, purpose: { not: "CHAT" }, chatMessage: null, currentAvatarOf: null, deletedAt: null }, select: { id: true, storageKey: true } }); }
  /** Commits physical-deletion success while retaining FK-safe metadata rows. */
  deleted(id: string) { return this.db.mediaAsset.updateMany({ where: { id, purpose: { not: "CHAT" }, chatMessage: null, currentAvatarOf: null }, data: { status: "DELETING", deletedAt: new Date(), expiresAt: null, isCover: false } }); }
  /** Refuses account completion if private media remains blocked by an unexpected live reference. */
  pending(userId: string, tx: DatabaseTransaction) { return tx.mediaAsset.count({ where: { uploadedById: userId, purpose: { not: "CHAT" }, chatMessage: null, deletedAt: null } }); }
}
