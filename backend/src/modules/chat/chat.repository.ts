import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";
import { visibleUserWhere } from "../user";

export const conversationProjection = {
  participants: {
    include: {
      user: { select: { id: true, displayName: true, status: true } },
      lastReadMessage: true,
      lastDeliveredMessage: true,
    },
  },
  listing: {
    select: {
      id: true,
      ownerId: true,
      title: true,
      type: true,
      status: true,
      price: true,
      rentalUnit: true,
      version: true,
      activeCycle: true,
      media: {
        where: { isCover: true, status: "ATTACHED", deletedAt: null },
        select: { id: true },
      },
    },
  },
} satisfies Prisma.ConversationInclude;
export const messageProjection = {
  proposal: true,
  cardSnapshot: true,
} satisfies Prisma.MessageInclude;
export type ConversationRow = Prisma.ConversationGetPayload<{
  include: typeof conversationProjection;
}>;
export type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageProjection }>;

export class ChatRepository {
  /** Tập trung truy vấn Chat và giao thức khóa; không quyết định nghiệp vụ trong repository. */
  constructor(private readonly db: PrismaClient) {}

  /** Giới hạn transaction có kiểm tra storage; không dùng transaction bao trùm copy snapshot. */
  transaction<T>(run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(run, { timeout: 120_000 });
  }

  /** Khóa từng tầng theo thứ tự được chia sẻ với Auth/User/Listing/Media. */
  async locks(
    tx: DatabaseTransaction,
    userIds: string[],
    listingId?: string | null,
    conversationId?: string,
  ) {
    await lockResources(
      tx,
      userIds.map((id) => `user:${id}`),
    );
    if (listingId) await lockResources(tx, [`listing:${listingId}`]);
    if (conversationId) await lockResources(tx, [`conversation:${conversationId}`]);
  }

  /** Đọc thời gian thực sau chờ khóa; clock PostgreSQL không cố định ở đầu transaction. */
  async now(tx: DatabaseTransaction): Promise<Date> {
    const [row] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    if (!row) throw new Error("Database clock unavailable");
    return row.now;
  }

  /** Nạp metadata sơ bộ hoặc projection đã khóa; caller luôn kiểm tra lại quyền. */
  conversation(id: string, tx?: DatabaseTransaction) {
    return (tx ?? this.db).conversation.findUnique({
      where: { id },
      include: conversationProjection,
    });
  }

  /** Tra Listing và cover làm dữ liệu đầu vào, không cấp quyền từ kết quả sơ bộ. */
  listing(id: string, tx?: DatabaseTransaction) {
    return (tx ?? this.db).listing.findUnique({
      where: { id },
      include: { media: { where: { isCover: true, status: "ATTACHED", deletedAt: null } } },
    });
  }

  /** Đọc trạng thái participant mới nhất dưới khóa User. */
  users(ids: string[], tx: DatabaseTransaction) {
    return tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } });
  }

  /** Dùng predicate công khai của User cho trạng thái/Block; không sao chép quy tắc hai chiều. */
  async pairAllowed(ids: string[], tx: DatabaseTransaction): Promise<boolean> {
    return (
      ids.length === 2 &&
      (await tx.user.count({ where: { id: ids[1], ...visibleUserWhere(ids[0]) } })) === 1
    );
  }

  /** Tìm uniqueness thực thi đã được database bảo vệ. */
  existing(where: Prisma.ConversationWhereInput, tx: DatabaseTransaction) {
    return tx.conversation.findFirst({ where, include: conversationProjection });
  }

  /** Tạo cả hai participant trong cùng transaction, không để Conversation nửa chừng. */
  create(data: Prisma.ConversationUncheckedCreateInput, ids: string[], tx: DatabaseTransaction) {
    return tx.conversation.create({
      data: { ...data, participants: { create: ids.map((userId) => ({ userId })) } },
      include: conversationProjection,
    });
  }

  /** Inbox dùng thứ tự tạo cố định để keyset không bỏ sót do lastMessageAt thay đổi giữa trang. */
  inbox(
    userId: string,
    filter: { type?: "DIRECT" | "LISTING"; listingId?: string },
    limit: number,
    last: { id: string; createdAt: Date } | undefined,
    tx: DatabaseTransaction,
  ) {
    return tx.conversation.findMany({
      where: {
        ...filter,
        participants: { some: { userId, hiddenAt: null } },
        ...(last
          ? {
              OR: [
                { createdAt: { lt: last.createdAt } },
                { createdAt: last.createdAt, id: { lt: last.id } },
              ],
            }
          : {}),
      },
      include: conversationProjection,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
  }

  /** Nạp từng message kèm proposal và snapshot để ánh xạ DTO mà không lộ storage key. */
  message(id: string, tx: DatabaseTransaction) {
    return tx.message.findUnique({ where: { id }, include: messageProjection });
  }

  /** Retry luôn tìm theo ba khóa server đã xác thực, không chỉ requestId do client cung cấp. */
  replay(conversationId: string, senderId: string, requestId: string, tx: DatabaseTransaction) {
    return tx.message.findUnique({
      where: { conversationId_senderId_requestId: { conversationId, senderId, requestId } },
      include: messageProjection,
    });
  }

  /** Lịch sử keyset mới nhất trước, dùng timestamp cùng UUID để tránh mất tin trùng thời gian. */
  messages(
    conversationId: string,
    limit: number,
    last: { id: string; createdAt: Date } | undefined,
    tx: DatabaseTransaction,
  ) {
    return tx.message.findMany({
      where: {
        conversationId,
        ...(last
          ? {
              OR: [
                { createdAt: { lt: last.createdAt } },
                { createdAt: last.createdAt, id: { lt: last.id } },
              ],
            }
          : {}),
      },
      include: messageProjection,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
  }

  /** Ghi Message với timestamp do server đã chọn sau khóa. */
  insertMessage(data: Prisma.MessageUncheckedCreateInput, tx: DatabaseTransaction) {
    return tx.message.create({ data, include: messageProjection });
  }

  /** Chỉ ẩn phía caller, không thay đổi activity hoặc read cursor. */
  hide(conversationId: string, userId: string, now: Date, tx: DatabaseTransaction) {
    return tx.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { hiddenAt: now },
    });
  }

  /** Mở lại Inbox của cả hai bên khi một nội dung mới thực sự commit. */
  restore(conversationId: string, tx: DatabaseTransaction) {
    return tx.conversationParticipant.updateMany({
      where: { conversationId },
      data: { hiddenAt: null },
    });
  }

  /** Read/delivered được service kiểm tra đơn điệu trước khi ghi dưới Conversation lock. */
  receipt(
    conversationId: string,
    userId: string,
    data: { lastReadMessageId?: string; lastDeliveredMessageId?: string },
    tx: DatabaseTransaction,
  ) {
    return tx.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data,
    });
  }

  /** Đếm tin từ đối tác sau read cursor, không tính tin bản thân gửi. */
  unread(
    conversationId: string,
    userId: string,
    last: { id: string; createdAt: Date } | null,
    tx: DatabaseTransaction,
  ) {
    return tx.message.count({
      where: {
        conversationId,
        senderId: { not: userId },
        ...(last
          ? {
              OR: [
                { createdAt: { gt: last.createdAt } },
                { createdAt: last.createdAt, id: { gt: last.id } },
              ],
            }
          : {}),
      },
    });
  }

  /** Activity chỉ đổi khi có Message mới hoặc proposal chuyển trạng thái. */
  activity(id: string, now: Date, message: boolean, tx: DatabaseTransaction) {
    return tx.conversation.update({
      where: { id },
      data: { lastActivityAt: now, ...(message ? { lastMessageAt: now } : {}) },
    });
  }

  /** Ghi outbox cùng transaction; consumer Notification xử lý độc lập, không chứa preview. */
  event(
    conversationId: string,
    eventType: string,
    payload: Prisma.InputJsonObject,
    tx: DatabaseTransaction,
  ) {
    return tx.outboxEvent.create({
      data: { aggregateType: "Conversation", aggregateId: conversationId, eventType, payload },
    });
  }

  /** Trả slot pending dưới cùng Conversation lock với mọi bên tạo/xử lý. */
  pending(conversationId: string, tx: DatabaseTransaction) {
    return tx.transactionProposal.findFirst({ where: { conversationId, status: "PENDING" } });
  }

  /** Tạo proposal chỉ từ scalar đã được application service kiểm tra. */
  proposal(data: Prisma.TransactionProposalUncheckedCreateInput, tx: DatabaseTransaction) {
    return tx.transactionProposal.create({ data });
  }

  /** Nạp card và kết quả hiện hành để kiểm tra quyền và idempotent resolve. */
  proposalCard(proposalId: string, tx: DatabaseTransaction) {
    return tx.message.findUnique({ where: { proposalId }, include: messageProjection });
  }

  /** Ghi kết quả proposal và acceptedCycle trong cùng transaction với Listing. */
  resolveProposal(
    id: string,
    data: Prisma.TransactionProposalUpdateInput,
    tx: DatabaseTransaction,
  ) {
    return tx.transactionProposal.update({ where: { id }, data });
  }

  /** Đặt trước snapshot có tracking nguồn trước khi copy ngoài transaction. */
  reserveSnapshot(data: Prisma.ListingCardSnapshotUncheckedCreateInput, tx: DatabaseTransaction) {
    return tx.listingCardSnapshot.create({ data });
  }

  /** Đọc snapshot mới nhất sau khi đã khóa Conversation; không tin trạng thái trước copy. */
  snapshot(id: string, tx: DatabaseTransaction) {
    return tx.listingCardSnapshot.findUnique({ where: { id } });
  }

  /** Tra metadata cho inventory key riêng; ảnh AVAILABLE không bao giờ bị xóa theo tuổi file. */
  snapshotByKey(imageStorageKey: string) {
    return this.db.listingCardSnapshot.findUnique({ where: { imageStorageKey } });
  }

  /** Token MVCC ngắn hạn ngăn worker cũ xác nhận thế hệ cleanup vừa được writer muộn mở lại. */
  async snapshotVersion(id: string, tx?: DatabaseTransaction): Promise<string | undefined> {
    const [row] = await (tx ?? this.db).$queryRaw<
      Array<{ version: string }>
    >`SELECT xmin::text AS version FROM listing_card_snapshots WHERE id=${id}::uuid`;
    return row?.version;
  }

  /** Cập nhật snapshot do service chọn, giữ source ref chỉ trong thời gian staging. */
  updateSnapshot(
    id: string,
    data: Prisma.ListingCardSnapshotUncheckedUpdateInput,
    tx: DatabaseTransaction,
  ) {
    return tx.listingCardSnapshot.update({ where: { id }, data });
  }

  /** Hàng rào lease ngay tại UPDATE cuối ngăn publish trễ dù các câu SQL trước đó đã chờ lâu. */
  async publishSnapshot(
    id: string,
    messageId: string,
    size: number,
    createdAt: Date,
    tx: DatabaseTransaction,
  ): Promise<number> {
    return tx.$executeRaw`UPDATE listing_card_snapshots
      SET "messageId"=${messageId}::uuid, "snapshotCreatedAt"=${createdAt},
        "imageState"='AVAILABLE', "imageSizeBytes"=${BigInt(size)},
        "sourceMediaId"=NULL, "sourceListingVersion"=NULL
      WHERE id=${id}::uuid AND "imageState"='PREPARING'
        AND "createdAt" > clock_timestamp() - INTERVAL '15 minutes'`;
  }

  /** Nạp tập ảnh có khả năng hết hạn trong một Conversation đang khóa. */
  snapshots(conversationId: string, tx: DatabaseTransaction) {
    return tx.listingCardSnapshot.findMany({
      where: { conversationId, imageState: { in: ["AVAILABLE", "PREPARING"] } },
    });
  }

  /** Worker quét có phân trang định danh; không tải toàn bộ snapshot trong một nhịp. */
  cleanupConversations(after?: string) {
    return this.db.conversation.findMany({
      where: {
        ...(after ? { id: { gt: after } } : {}),
        cardSnapshots: { some: { imageState: { not: "DELETED" } } },
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 20,
    });
  }

  /** Tombstone cho phép retry vật lý mà không phục hồi quyền phục vụ. */
  revokedSnapshots(after?: string) {
    return this.db.listingCardSnapshot.findMany({
      where: { imageState: "REVOKED", ...(after ? { id: { gt: after } } : {}) },
      take: 20,
      orderBy: { id: "asc" },
    });
  }

  /** Hoàn tất sự kiện cleanup sau khi vật lý và tombstone đã xong; consumer Notification không xử lý loại này. */
  completeSnapshotCleanup(conversationId: string, snapshotId: string, tx: DatabaseTransaction) {
    return tx.outboxEvent.updateMany({
      where: {
        aggregateId: conversationId,
        eventType: "chat.snapshot.revoked",
        payload: { path: ["snapshotId"], equals: snapshotId },
      },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
  }
}
