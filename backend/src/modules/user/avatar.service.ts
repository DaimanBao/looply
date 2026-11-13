import type { UserRepository } from "./user.repository";
import type { UserService } from "./user.service";
import type { Principal, SessionService } from "../auth";
import type { AvatarMediaService } from "../media";
import { optimizeAvatar } from "../media";

export class AvatarService {
  /** Phối hợp con trỏ User và sở hữu Media qua service/repository tường minh. */
  constructor(
    private readonly users: UserService,
    private readonly repository: UserRepository,
    private readonly media: AvatarMediaService,
    private readonly sessions: SessionService,
  ) {}

  /** Giữ avatar cũ đến khi upload hợp lệ và đính kèm đều thành công; tài nguyên TEMP bỏ dở sẽ hết hạn. */
  async upload(principal: Principal, input: Buffer) {
    const bytes = await optimizeAvatar(input);
    const id = await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, [principal.userId]);
      await this.sessions.requireCurrent(principal, tx);
      return this.media.reserve(principal.userId, bytes.length, tx);
    });
    await this.media.write(id, bytes);
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, [principal.userId]);
      const user = await this.sessions.requireCurrent(principal, tx);
      await this.media.attach(id, principal.userId, tx);
      await this.repository.update(user.id, { avatarMedia: { connect: { id } } }, tx);
      if (user.avatarMediaId) await this.media.detached(user.avatarMediaId, user.id, tx);
    });
    return this.users.me(principal);
  }

  /** Tách trong transaction, trì hoãn cleanup vật lý đến sau khi commit con trỏ. */
  async remove(principal: Principal): Promise<void> {
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, [principal.userId]);
      const user = await this.sessions.requireCurrent(principal, tx);
      await this.repository.update(user.id, { avatarMedia: { disconnect: true } }, tx);
      if (user.avatarMediaId) await this.media.detached(user.avatarMediaId, user.id, tx);
    });
  }

  /** Áp dụng cùng kiểm tra hồ sơ/block trước khi đọc byte storage riêng. */
  async get(userId: string, viewer?: Principal) {
    await this.users.profile(userId, viewer);
    return this.media.get(userId);
  }
}
