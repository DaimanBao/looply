import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";
import { queueMediaCleanup } from "./media-cleanup-event";

export class ListingMediaRepository {
  /** Dùng chung transaction với bên ghi Listing; không quản lý I/O storage. */
  constructor(private readonly db: PrismaClient) {}

  /** Commit đặt trước và hủy độc lập với storage vật lý. */
  transaction<T>(run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(run);
  }

  /** Tuần tự hóa vòng đời tài khoản trước khi lấy khóa Listing hoặc Media. */
  lockUser(userId: string, tx: DatabaseTransaction) {
    return lockResources(tx, [`user:${userId.toLowerCase()}`]);
  }

  /** Giữ thứ bậc khóa đã duyệt; bên gọi phải giữ mọi khóa User liên quan trước. */
  async lockMedia(ids: string[], tx: DatabaseTransaction, listingId?: string): Promise<void> {
    if (listingId) await lockResources(tx, [`listing:${listingId.toLowerCase()}`]);
    await lockResources(
      tx,
      ids.map((id) => `media:${id.toLowerCase()}`),
    );
  }

  /** Dùng thời gian thực database sau khi chờ khóa, kể cả hết hạn đúng biên. */
  async now(tx: DatabaseTransaction): Promise<Date> {
    const [row] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    if (!row) throw new Error("Database clock unavailable");
    return row.now;
  }

  /** Đọc lại sở hữu và trạng thái trong transaction thay đổi. */
  asset(id: string, tx: DatabaseTransaction) {
    return tx.mediaAsset.findUnique({ where: { id } });
  }

  /** Đọc toàn bộ thành viên Listing hiện tại trong khi giữ khóa Listing. */
  members(listingId: string, tx: DatabaseTransaction) {
    return tx.mediaAsset.findMany({ where: { listingId }, orderBy: { id: "asc" } });
  }

  /** Giải phóng cover unique một phần trước khi chọn bản thay thế. */
  clearCover(listingId: string, tx: DatabaseTransaction) {
    return tx.mediaAsset.updateMany({
      where: { listingId, isCover: true },
      data: { isCover: false },
    });
  }

  /** Chỉ lưu trường trình bày cuối của đính kèm đã kiểm tra. */
  presentation(id: string, position: number | null, isCover: boolean, tx: DatabaseTransaction) {
    return tx.mediaAsset.update({ where: { id }, data: { position, isCover } });
  }

  /** Bảo vệ mọi loại tham chiếu đã triển khai; bên ghi snapshot tương lai phải tuân thủ giao thức khóa này. */
  async referenced(id: string, tx: DatabaseTransaction): Promise<boolean> {
    return !!(await tx.mediaAsset.findFirst({
      where: { id, OR: [{ currentAvatarOf: { isNot: null } }, { chatMessage: { isNot: null } }] },
      select: { id: true },
    }));
  }

  /** Đọc vòng đời từ User đã khóa, không tin kiểm tra trước đó của yêu cầu. */
  user(id: string, tx: DatabaseTransaction) {
    return tx.user.findUnique({ where: { id } });
  }

  /** Giữ phân quyền Listing tại ranh giới đính kèm nội bộ. */
  listing(id: string, tx: DatabaseTransaction) {
    return tx.listing.findUnique({ where: { id } });
  }

  /** Đặt trước metadata do server sinh trước khi ghi object đầu tiên. */
  reserve(
    input: {
      id: string;
      userId: string;
      bytes: number;
      expiresAt: Date;
      video?: { extension: "mp4" | "webm"; mimeType: string; durationSeconds: number };
    },
    tx: DatabaseTransaction,
  ) {
    return tx.mediaAsset.create({
      data: {
        id: input.id,
        uploadedById: input.userId,
        purpose: "LISTING",
        type: input.video ? "VIDEO" : "IMAGE",
        status: "TEMP",
        storageKey: `listing/v1/${input.id}.${input.video?.extension ?? "webp"}`,
        sizeBytes: input.bytes,
        mimeType: input.video?.mimeType ?? "image/webp",
        durationSeconds: input.video?.durationSeconds ?? null,
        expiresAt: input.expiresAt,
      },
    });
  }

  /** Chuyển trạng thái có điều kiện cũng từ chối bên đính kèm đã lỗi thời dù bỏ qua đọc trước. */
  attach(
    id: string,
    input: { userId: string; listingId: string; position: number | null; now: Date },
    tx: DatabaseTransaction,
  ) {
    return tx.mediaAsset.updateMany({
      where: {
        id,
        uploadedById: input.userId,
        purpose: "LISTING",
        status: "TEMP",
        listingId: null,
        deletedAt: null,
        expiresAt: { gt: input.now },
      },
      data: {
        status: "ATTACHED",
        listingId: input.listingId,
        expiresAt: null,
        position: input.position,
      },
    });
  }

  /** Hủy và sự kiện thử lại commit cùng nhau, không tạo tác dụng phụ storage. */
  async cancel(id: string, userId: string, tx: DatabaseTransaction): Promise<void> {
    await tx.mediaAsset.update({
      where: { id },
      data: { status: "DELETING", listingId: null, position: null, isCover: false },
    });
    await queueMediaCleanup(userId, id, tx);
  }

  /** Mở lại tombstone cleanup sau khi bên ghi muộn kết thúc để không bỏ sót biến thể mới ghi. */
  async abandon(id: string, userId: string, tx: DatabaseTransaction): Promise<void> {
    await tx.mediaAsset.update({ where: { id }, data: { deletedAt: null } });
    await this.cancel(id, userId, tx);
  }
}
