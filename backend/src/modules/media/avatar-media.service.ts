import { randomUUID } from "node:crypto";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import type { MediaRepository } from "./media.repository";
import type { ObjectStore } from "./object-store";
import { AppError } from "../../shared/errors/app-error";

export class AvatarMediaService {
  /** Exposes Media operations through a service boundary; User never receives a storage key or repository. */
  constructor(private readonly repository: MediaRepository, private readonly storage: ObjectStore) {}
  /** Reserves a recoverable temporary record under an opaque key, before the storage side effect. */
  async reserve(userId: string, size: number, tx: DatabaseTransaction): Promise<string> {
    const id = randomUUID(); await this.repository.temporary(id, userId, `profile/${id}.webp`, size, tx); return id;
  }
  /** Writes validated bytes to the same deterministic key reserved by Media. */
  async write(id: string, bytes: Buffer): Promise<void> { await this.storage.put(`profile/${id}.webp`, bytes); }
  /** Claims only an unexpired upload from the authenticated owner inside the pointer-update transaction. */
  async attach(id: string, userId: string, tx: DatabaseTransaction): Promise<void> {
    if ((await this.repository.attach(id, userId, tx)).count !== 1) throw new AppError(409, "UPLOAD_EXPIRED", "Upload expired; upload the image again.");
  }
  /** Durably schedules post-commit cleanup by ID, keeping provider keys and PII out of events. */
  async detached(id: string, userId: string, tx: DatabaseTransaction): Promise<void> { await this.repository.queueCleanup(userId, id, tx); }
  /** Returns private bytes only for a live, owned, current profile image; caller applies User visibility first. */
  async get(userId: string): Promise<{ bytes: Buffer; mimeType: string }> {
    const avatar = await this.repository.currentAvatar(userId);
    if (!avatar) throw new AppError(404, "NOT_FOUND", "Avatar not found.");
    try { return { bytes: await this.storage.get(avatar.storageKey), mimeType: avatar.mimeType }; }
    catch { throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is temporarily unavailable."); }
  }
}
