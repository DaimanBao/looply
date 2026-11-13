import { randomUUID } from "node:crypto";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import type { MediaRepository } from "./media.repository";
import type { ObjectStore } from "./object-store";
import { AppError } from "../../shared/errors/app-error";

export class AvatarMediaService {
  /** Cung cấp thao tác Media qua service; User không nhận storage key hoặc repository. */
  constructor(
    private readonly repository: MediaRepository,
    private readonly storage: ObjectStore,
  ) {}

  /** Đặt trước bản ghi tạm có thể phục hồi bằng khóa opaque trước tác dụng phụ storage. */
  async reserve(userId: string, size: number, tx: DatabaseTransaction): Promise<string> {
    const id = randomUUID();
    await this.repository.temporary(id, userId, `profile/${id}.webp`, size, tx);
    return id;
  }

  /** Ghi byte đã kiểm tra vào đúng khóa xác định do Media đặt trước. */
  async write(id: string, bytes: Buffer): Promise<void> {
    await this.storage.put(`profile/${id}.webp`, bytes);
  }

  /** Chỉ nhận upload chưa hết hạn của chủ đã xác thực trong transaction cập nhật con trỏ. */
  async attach(id: string, userId: string, tx: DatabaseTransaction): Promise<void> {
    if ((await this.repository.attach(id, userId, tx)).count !== 1)
      throw new AppError(409, "UPLOAD_EXPIRED", "Upload expired; upload the image again.");
  }

  /** Lập lịch cleanup bền vững sau commit theo ID, giữ provider key và PII ngoài sự kiện. */
  async detached(id: string, userId: string, tx: DatabaseTransaction): Promise<void> {
    await this.repository.queueCleanup(userId, id, tx);
  }

  /** Chỉ trả byte riêng tư cho ảnh hồ sơ còn hiệu lực, thuộc sở hữu và đang dùng; bên gọi kiểm tra hiển thị User trước. */
  async get(userId: string): Promise<{ bytes: Buffer; mimeType: string }> {
    const avatar = await this.repository.currentAvatar(userId);
    if (!avatar) throw new AppError(404, "NOT_FOUND", "Avatar not found.");
    try {
      return { bytes: await this.storage.get(avatar.storageKey), mimeType: avatar.mimeType };
    } catch {
      throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is temporarily unavailable.");
    }
  }
}
