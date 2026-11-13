import type { IdentityService, Principal, SessionService } from "../../auth";
import type { DeletionRepository } from "./deletion.repository";
import { conflict, forbidden } from "../../auth";

export class DeletionService {
  /** Dùng proof do Auth quản lý và phiên hiện tại thay vì tin cờ xác minh client. */
  constructor(
    private readonly repository: DeletionRepository,
    private readonly sessions: SessionService,
    private readonly identity: IdentityService,
  ) {}

  /** Lập lịch xóa sau 30 ngày và thu hồi mọi phiên kể cả bên yêu cầu, không tác động Listing/Media. */
  async request(principal: Principal, proof: string): Promise<void> {
    await this.identity.consumeReauth(principal, "DELETE_ACCOUNT", proof);
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(principal.userId, tx);
      await this.sessions.requireCurrent(principal, tx);
      await this.repository.request(principal.userId, tx);
      await this.sessions.revokeAll(principal.userId, tx);
    });
  }

  /** Yêu cầu đăng nhập hạn chế mới và DELETE tường minh; không tự hủy khi đăng nhập. */
  async cancel(principal: Principal): Promise<void> {
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(principal.userId, tx);
      const user = await this.sessions.requireCurrent(principal, tx, false);
      if (user.status !== "PENDING_DELETION") throw forbidden();
      if ((await this.repository.cancel(user.id, tx)).count !== 1)
        throw conflict("Deletion has already started.");
    });
  }
}
