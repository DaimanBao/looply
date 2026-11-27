import type { Principal, SessionService } from "../auth";
import { AppError } from "../../shared/errors/app-error";
import { ListingRepository } from "./listing.repository";

export class ListingFollowService {
  /** Phối hợp lưu quan hệ với khóa Listing hiện có và kiểm tra phiên có thẩm quyền. */
  constructor(
    private readonly listings: ListingRepository,
    private readonly sessions: SessionService,
  ) {}

  /** Khóa đủ cặp User trước Listing, rồi đọc lại mọi điều kiện trước upsert idempotent. */
  async follow(id: string, principal: Principal): Promise<void> {
    const candidate = await this.listings.owner(id);
    if (!candidate) throw new AppError(404, "NOT_FOUND", "Listing not found.");
    await this.listings.transaction(async (tx) => {
      await this.listings.lockUsers([candidate.ownerId, principal.userId], tx);
      await this.sessions.requireCurrent(principal, tx);
      await this.listings.lockListing(id, tx);
      const row = await this.listings.get(id, tx);
      if (
        !row ||
        row.ownerId !== candidate.ownerId ||
        row.status !== "ACTIVE" ||
        row.deletedAt ||
        !(await this.listings.visibleOwner(row.ownerId, principal.userId, tx))
      )
        throw new AppError(404, "NOT_FOUND", "Listing not found.");
      if (row.ownerId === principal.userId)
        throw new AppError(403, "SELF_INTERACTION", "Cannot follow your own listing.");
      await this.listings.follow(principal.userId, id, tx);
    });
  }

  /** Không kiểm tra chủ/trạng thái bên khác; tuần tự hóa xóa với theo dõi mà không lấy thêm khóa User sau đó. */
  async unfollow(id: string, principal: Principal): Promise<void> {
    await this.listings.transaction(async (tx) => {
      await this.listings.lockUsers([principal.userId], tx);
      await this.sessions.requireCurrent(principal, tx);
      await this.listings.lockListing(id, tx);
      await this.listings.unfollow(principal.userId, id, tx);
    });
  }
}
