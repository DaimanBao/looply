import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { queueMediaCleanup } from "./media-cleanup-event";

export class MediaRepository {
  /** Shares the pool and transaction clients with User mutations. */
  constructor(private readonly db: PrismaClient) {}
  /** Stores recoverable temporary metadata before attempting the nontransactional storage write. */
  temporary(id: string, userId: string, storageKey: string, bytes: number, tx: DatabaseTransaction) {
    return tx.mediaAsset.create({ data: { id, uploadedById: userId, purpose: "PROFILE", type: "IMAGE", storageKey, mimeType: "image/webp", sizeBytes: bytes, status: "TEMP", expiresAt: new Date(Date.now() + 15 * 60000) } });
  }
  /** Claims only an unexpired temporary upload from its owner. */
  attach(id: string, userId: string, tx: DatabaseTransaction) { return tx.mediaAsset.updateMany({ where: { id, uploadedById: userId, purpose: "PROFILE", status: "TEMP", expiresAt: { gt: new Date() }, deletedAt: null }, data: { status: "ATTACHED", expiresAt: null } }); }
  /** Uses existing outbox durability for detachment cleanup, without copying keys or PII into events. */
  queueCleanup(userId: string, mediaId: string, tx: DatabaseTransaction) { return queueMediaCleanup(userId, mediaId, tx); }
  /** Returns only a current, live, owned profile image, never arbitrary assets by supplied storage key. */
  currentAvatar(userId: string) { return this.db.mediaAsset.findFirst({ where: { currentAvatarOf: { id: userId }, uploadedById: userId, purpose: "PROFILE", type: "IMAGE", status: "ATTACHED", deletedAt: null } }); }
}
