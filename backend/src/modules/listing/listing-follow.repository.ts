import type { DatabaseTransaction } from "../../shared/database/prisma";

export class ListingFollowRepository {
  /** Giữ quan hệ duy nhất hiện có và cho phép theo dõi trùng thành công mà không thêm tác dụng phụ. */
  follow(userId: string, listingId: string, tx: DatabaseTransaction) {
    return tx.listingFollow.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId },
      update: {},
    });
  }

  /** Chỉ xóa quan hệ của người dùng đã xác thực, bất kể Listing hiện có hoặc được hiển thị hay không. */
  unfollow(userId: string, listingId: string, tx: DatabaseTransaction) {
    return tx.listingFollow.deleteMany({ where: { userId, listingId } });
  }
}
