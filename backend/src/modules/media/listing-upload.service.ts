import type { Principal, SessionService } from "../auth";
import type { ListingMediaService } from "./listing-media.service";
import type { ListingMediaRepository } from "./listing-media.repository";
import { optimizeListingImage } from "./listing-image";
import { AppError } from "../../shared/errors/app-error";
import { open, readFile } from "node:fs/promises";
import { inspectListingVideo, videoSignature } from "./listing-video";

export class ListingUploadService {
  /** Adapts the authenticated HTTP workflow to the existing Media lifecycle. */
  constructor(private readonly lifecycle: ListingMediaService, private readonly repository: ListingMediaRepository, private readonly sessions: SessionService) {}
  /** Routes actual content to bounded image decode or video probe/decode before reserving any database metadata. */
  async uploadFile(principal: Principal, path: string, signal?: AbortSignal) {
    const handle = await open(path, "r"); const header = Buffer.alloc(16);
    try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
    if (!videoSignature(header)) {
      const size = await open(path, "r");
      try { if ((await size.stat()).size > 10 * 1024 * 1024) throw new AppError(413, "PAYLOAD_TOO_LARGE", "Choose an image up to 10 MiB."); } finally { await size.close(); }
      return this.upload(principal, await readFile(path));
    }
    const video = await inspectListingVideo(path, signal);
    if (signal?.aborted) throw new AppError(503, "MEDIA_VIDEO_UNAVAILABLE", "Video upload was interrupted.");
    await this.current(principal);
    const reservation = await this.lifecycle.reserve(principal.userId, video.sizeBytes, video);
    await this.lifecycle.writeVideo(reservation.id, principal.userId, video);
    await this.repository.transaction(async (tx) => {
      await this.repository.lockUser(principal.userId, tx); await this.repository.lockMedia([reservation.id], tx); await this.sessions.requireCurrent(principal, tx);
      const asset = await this.repository.asset(reservation.id, tx);
      if (!asset || asset.status !== "TEMP" || asset.deletedAt || !asset.expiresAt || asset.expiresAt <= await this.repository.now(tx)) throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Upload is no longer available.");
    });
    return { id: reservation.id, status: "TEMP", type: "VIDEO", mimeType: video.mimeType, sizeBytes: video.sizeBytes.toString(), durationSeconds: video.durationSeconds, expiresAt: reservation.expiresAt };
  }
  /** Returns a TEMP identifier only after server-validated bytes and readiness are published. */
  async upload(principal: Principal, input: Buffer) {
    const images = await optimizeListingImage(input);
    await this.current(principal);
    const reservation = await this.lifecycle.reserve(principal.userId, images.detail.length);
    await this.lifecycle.write(reservation.id, principal.userId, images);
    await this.repository.transaction(async (tx) => {
      await this.repository.lockUser(principal.userId, tx); await this.repository.lockMedia([reservation.id], tx);
      await this.sessions.requireCurrent(principal, tx);
      const asset = await this.repository.asset(reservation.id, tx);
      if (!asset || asset.status !== "TEMP" || asset.deletedAt || !asset.expiresAt || asset.expiresAt <= await this.repository.now(tx)) throw new AppError(409, "MEDIA_NOT_AVAILABLE", "Upload is no longer available.");
    });
    return { id: reservation.id, status: "TEMP", type: "IMAGE", mimeType: "image/webp", sizeBytes: images.detail.length.toString(), durationSeconds: null, expiresAt: reservation.expiresAt };
  }
  /** Verifies the current session inside the cancellation transaction before changing lifecycle state. */
  async cancel(principal: Principal, id: string): Promise<void> {
    await this.repository.transaction(async (tx) => {
      await this.repository.lockUser(principal.userId, tx); await this.sessions.requireCurrent(principal, tx);
      await this.lifecycle.cancelInTransaction(id, principal.userId, tx);
    });
  }
  /** Rechecks session revocation after expensive processing and after storage publication. */
  private async current(principal: Principal): Promise<void> {
    await this.repository.transaction(async (tx) => { await this.repository.lockUser(principal.userId, tx); await this.sessions.requireCurrent(principal, tx); });
  }
}
