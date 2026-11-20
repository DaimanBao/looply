import type { DatabaseTransaction } from "../../shared/database/prisma";

/** Đọc scalar Listing dưới khóa của transaction giao dịch; không truy cập storage hoặc dữ liệu Chat. */
export function transactionListing(id: string, tx: DatabaseTransaction) {
  return tx.listing.findUnique({ where: { id } });
}

/** Lưu chuyển trạng thái đã được Listing service kiểm tra trong transaction nhận proposal. */
export function hideAcceptedListing(id: string, tx: DatabaseTransaction) {
  return tx.listing.update({
    where: { id },
    data: { status: "HIDDEN", version: { increment: 1 } },
  });
}
