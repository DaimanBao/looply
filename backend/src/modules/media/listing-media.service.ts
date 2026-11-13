import { randomUUID } from "node:crypto";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import type { ObjectStore } from "./object-store";
import type { ListingMediaRepository } from "./listing-media.repository";
import { listingMediaObjectKeys } from "./media-object-keys";

export class ListingMediaService {
  /** Internal image lifecycle primitives only; no Listing CRUD or HTTP routes are mounted. */
  constructor(private readonly repository: ListingMediaRepository, private readonly storage: ObjectStore) {}
  /** Reserves an expiring image; input is trusted output of the server image processor, never client metadata. */
  async reserve(userId: string, sizeBytes: number): Promise<{ id: string; expiresAt: Date }> {
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 10 * 1024 * 1024) throw new Error("Invalid processed image size");
    return this.repository.transaction(async (tx) => {
      await this.repository.lockUser(userId, tx);
      await this.requireActive(userId, tx);
      const now = await this.repository.now(tx);
      const id = randomUUID(); const expiresAt = new Date(now.getTime() + 15 * 60_000);
      await this.repository.reserve({ id, userId, bytes: sizeBytes, expiresAt }, tx);
      return { id, expiresAt };
    });
  }
  /** Writes processor output only to the reserved keys; readiness is published last under the shared locks. */
  async write(id: string, userId: string, images: { detail: Buffer; thumbnail: Buffer }): Promise<void> {
    const media = await this.repository.transaction(async (tx) => {
      await this.repository.lockUser(userId, tx);
      await this.repository.lockMedia([id], tx);
      await this.requireActive(userId, tx);
      const asset = await this.repository.asset(id, tx);
      if (!asset || asset.uploadedById !== userId || asset.purpose !== "LISTING" || asset.type !== "IMAGE") throw new AppError(404, "NOT_FOUND", "Media not found.");
      const now = await this.repository.now(tx);
      if (asset.status !== "TEMP" || asset.deletedAt || !asset.expiresAt || asset.expiresAt <= now || asset.sizeBytes !== BigInt(images.detail.length) || !images.thumbnail.length) throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Upload is no longer available.");
      return asset;
    });
    const keys = listingMediaObjectKeys(media.storageKey);
    try {
      await this.storage.put(keys[0], images.detail);
      await this.storage.put(keys[1], images.thumbnail);
      await this.repository.transaction(async (tx) => {
        await this.repository.lockUser(userId, tx);
        await this.repository.lockMedia([id], tx);
        await this.requireActive(userId, tx);
        const current = await this.repository.asset(id, tx);
        const now = await this.repository.now(tx);
        if (!current || current.status !== "TEMP" || current.deletedAt || !current.expiresAt || current.expiresAt <= now) throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Upload is no longer available.");
        await this.storage.put(keys[2], Buffer.from("looply-listing-v1"));
      });
    } catch (error) {
      // All writes have settled. Reconcile even if cleanup already removed metadata's original objects.
      await this.repository.transaction(async (tx) => {
        await this.repository.lockUser(userId, tx);
        await this.repository.lockMedia([id], tx);
        const current = await this.repository.asset(id, tx);
        if (current && current.status !== "ATTACHED") await this.repository.abandon(id, userId, tx);
      });
      throw error;
    }
  }
  /** Rejects attachment until the server has durably completed every deterministic rendition. */
  private async requireReady(key: string, sizeBytes: bigint): Promise<void> {
    try {
      const keys = listingMediaObjectKeys(key);
      const marker = await this.storage.get(keys[2]);
      if (!marker.equals(Buffer.from("looply-listing-v1"))) throw new Error("Invalid completion marker");
      const detail = await this.storage.get(keys[0]);
      const thumbnail = await this.storage.get(keys[1]);
      if (BigInt(detail.length) !== sizeBytes || !thumbnail.length) throw new Error("Incomplete renditions");
    } catch { throw new AppError(409, "MEDIA_NOT_READY", "Upload is not ready."); }
  }
  /** Attaches inside the caller's Listing transaction; caller validates the final gallery/cover and holds all User locks first. */
  async attach(input: { assets: Array<{ id: string; position: number }>; userId: string; listingId: string }, tx: DatabaseTransaction): Promise<void> {
    if (!input.assets.length || input.assets.length > 5 || new Set(input.assets.map((asset) => asset.id)).size !== input.assets.length
      || new Set(input.assets.map((asset) => asset.position)).size !== input.assets.length
      || input.assets.some((asset) => !Number.isSafeInteger(asset.position) || asset.position < 0)) throw new AppError(400, "VALIDATION_ERROR", "Invalid image attachments.");
    await this.repository.lockUser(input.userId, tx);
    await this.repository.lockMedia(input.assets.map((asset) => asset.id), tx, input.listingId);
    await this.requireActive(input.userId, tx);
    const listing = await this.repository.listing(input.listingId, tx);
    if (!listing || listing.ownerId !== input.userId || listing.status === "DELETED") throw new AppError(404, "NOT_FOUND", "Listing not found.");
    for (const asset of input.assets) await this.attachAsset({ ...asset, userId: input.userId, listingId: input.listingId }, tx);
  }
  /** Validates one image after the entire batch's locks are held; a later failure rolls back all attachments. */
  private async attachAsset(input: { id: string; userId: string; listingId: string; position: number }, tx: DatabaseTransaction): Promise<void> {
    const media = await this.repository.asset(input.id, tx);
    if (!media || media.uploadedById !== input.userId || media.purpose !== "LISTING" || media.type !== "IMAGE") throw new AppError(404, "NOT_FOUND", "Media not found.");
    const now = await this.repository.now(tx);
    if (media.status !== "TEMP" || media.listingId || media.deletedAt || !media.expiresAt || media.expiresAt <= now || await this.repository.referenced(media.id, tx)) throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Upload is no longer available.");
    await this.requireReady(media.storageKey, media.sizeBytes);
    // Recheck time after bounded storage I/O; an upload can expire during that check.
    if ((await this.repository.attach(input.id, { ...input, now: await this.repository.now(tx) }, tx)).count !== 1) throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Upload is no longer available.");
  }
  /** Cancels only the authenticated uploader's TEMP asset; terminal retries do not duplicate jobs. */
  async cancel(id: string, userId: string): Promise<void> {
    await this.repository.transaction(async (tx) => {
      await this.repository.lockUser(userId, tx);
      await this.repository.lockMedia([id], tx);
      await this.requireActive(userId, tx);
      const media = await this.repository.asset(id, tx);
      if (!media || media.uploadedById !== userId || media.purpose !== "LISTING") throw new AppError(404, "NOT_FOUND", "Media not found.");
      if (media.status === "DELETING" || media.deletedAt) return;
      if (media.status === "ATTACHED" || media.listingId || await this.repository.referenced(id, tx)) throw new AppError(409, "MEDIA_ALREADY_ATTACHED", "Media is already attached.");
      await this.repository.cancel(id, userId, tx);
    });
  }
  /** Gates all internal writes against account deletion even when no HTTP middleware is involved. */
  private async requireActive(userId: string, tx: DatabaseTransaction): Promise<void> {
    if ((await this.repository.user(userId, tx))?.status !== "ACTIVE") throw new AppError(403, "ACCOUNT_NOT_ACTIVE", "Account is not active.");
  }
}
