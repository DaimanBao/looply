import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";
import { visibleUserWhere } from "../user";

export const listingProjection = {
  province: { select: { code: true, name: true } },
  owner: {
    include: {
      province: { select: { code: true, name: true } },
      _count: { select: { followerRelations: true, followingRelations: true } },
    },
  },
  media: {
    where: { status: "ATTACHED", deletedAt: null },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.ListingInclude;
export type ListingRow = Prisma.ListingGetPayload<{ include: typeof listingProjection }>;
export class ListingRepository {
  /** Giữ lưu trữ và cơ chế khóa dùng chung ngoài chính sách Listing. */
  constructor(private readonly db: PrismaClient) {}

  /** Giới hạn kiểm tra sẵn sàng/phân phối storage trong thời gian giữ khóa transaction. */
  transaction<T>(run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(run, { timeout: 120_000 });
  }

  /** Khóa mọi người dùng liên quan trước, thống nhất với Auth/User/Media/cleanup tài khoản. */
  lockUsers(ids: string[], tx: DatabaseTransaction) {
    return lockResources(
      tx,
      ids.map((id) => `user:${id.toLowerCase()}`),
    );
  }

  /** Tuần tự hóa mọi thay đổi với bên tạo Conversation trong tương lai. */
  lockListing(id: string, tx: DatabaseTransaction) {
    return lockResources(tx, [`listing:${id.toLowerCase()}`]);
  }

  /** Chỉ tra quyền sở hữu bất biến; luôn đọc lại phân quyền sau khi khóa. */
  owner(id: string) {
    return this.db.listing.findUnique({ where: { id }, select: { ownerId: true } });
  }

  /** Nạp projection tường minh dùng ánh xạ DTO dưới các khóa của bên gọi. */
  get(id: string, tx: DatabaseTransaction) {
    return tx.listing.findUnique({ where: { id }, include: listingProjection });
  }

  /** Áp dụng điều kiện vòng đời User công khai/Block hiện có. */
  visibleOwner(id: string, viewerId: string | undefined, tx: DatabaseTransaction) {
    return tx.user.findFirst({
      where: { id, ...visibleUserWhere(viewerId) },
      select: { id: true },
    });
  }

  /** Chỉ tìm mục danh mục hoạt động khi chọn/đổi Province. */
  province(code: string, tx: DatabaseTransaction) {
    return tx.province.findFirst({ where: { code, isActive: true }, select: { id: true } });
  }

  /** Đọc thông tin tương tác dưới khóa Listing mà không sửa dữ liệu Chat. */
  async interactions(listingId: string, tx: DatabaseTransaction) {
    const conversation = await tx.conversation.findFirst({
      where: { listingId },
      select: { id: true },
    });
    const accepted = await tx.transactionProposal.findFirst({
      where: { listingId, status: "ACCEPTED" },
      select: { id: true },
    });
    return { hasConversations: !!conversation, hasAcceptedProposal: !!accepted };
  }

  /** Đọc Follow hiện có cho projection response, không triển khai thay đổi Follow. */
  followed(listingId: string, userId: string, tx: DatabaseTransaction) {
    return tx.listingFollow.findUnique({
      where: { userId_listingId: { userId, listingId } },
      select: { id: true },
    });
  }

  /** Chỉ tạo trường scalar do service chọn, giữ mặc định của server. */
  create(data: Prisma.ListingUncheckedCreateInput, tx: DatabaseTransaction) {
    return tx.listing.create({ data });
  }

  /** Kết hợp expectedVersion và sở hữu với chuyển trạng thái đã khóa để tăng hàng rào ghi. */
  update(
    id: string,
    ownerId: string,
    version: number,
    data: Prisma.ListingUpdateManyMutationInput,
    tx: DatabaseTransaction,
  ) {
    return tx.listing.updateMany({ where: { id, ownerId, version }, data });
  }

  /** Theo dõi idempotent bằng khóa duy nhất của quan hệ User–Listing. */
  follow(userId: string, listingId: string, tx: DatabaseTransaction) {
    return tx.listingFollow.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId },
      update: {},
    });
  }

  /** Gỡ quan hệ của riêng người gọi, kể cả khi bài đăng không còn hiển thị. */
  unfollow(userId: string, listingId: string, tx: DatabaseTransaction) {
    return tx.listingFollow.deleteMany({ where: { userId, listingId } });
  }

  /** Dùng thời gian thực của database sau khi khóa thay vì thời điểm bắt đầu transaction. */
  async now(tx: DatabaseTransaction): Promise<Date> {
    const [row] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    if (!row) throw new Error("Database clock unavailable");
    return row.now;
  }

  /** Dùng điều kiện keyset ghép, không yêu cầu hàng biên còn tồn tại. */
  mine(
    ownerId: string,
    status: "ACTIVE" | "HIDDEN" | undefined,
    limit: number,
    asOf: Date,
    last: { createdAt: Date; id: string } | undefined,
    tx: DatabaseTransaction,
  ) {
    return tx.listing.findMany({
      where: {
        ownerId,
        status: status ?? { in: ["ACTIVE", "HIDDEN"] },
        deletedAt: null,
        createdAt: { lte: asOf },
        ...(last
          ? {
              OR: [
                { createdAt: { lt: last.createdAt } },
                { createdAt: last.createdAt, id: { lt: last.id } },
              ],
            }
          : {}),
      },
      include: listingProjection,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
  }

  /** Chụp Conversation dưới Listing lock để worker trễ không gửi cho contact mới xuất hiện sau edit. */
  async event(listingId: string, version: number, tx: DatabaseTransaction) {
    const conversations = await tx.conversation.findMany({
      where: { listingId },
      select: { id: true },
    });
    return tx.outboxEvent.create({
      data: {
        aggregateType: "Listing",
        aggregateId: listingId,
        eventType: "listing.updated",
        payload: { listingId, version, conversationIds: conversations.map((row) => row.id) },
      },
    });
  }
}

/** Đọc scalar Listing trong transaction nhận proposal đã giữ khóa Listing. */
export function transactionListing(id: string, tx: DatabaseTransaction) {
  return tx.listing.findUnique({ where: { id } });
}

/** Lưu chuyển trạng thái đã được Listing kiểm tra trong transaction nhận proposal. */
export function hideAcceptedListing(id: string, tx: DatabaseTransaction) {
  return tx.listing.update({
    where: { id },
    data: { status: "HIDDEN", version: { increment: 1 } },
  });
}
