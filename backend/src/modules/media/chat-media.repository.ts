import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";

export class ChatMediaRepository {
  /** Chứa truy cập metadata và khóa media; không thực hiện I/O object storage. */
  constructor(private readonly db: PrismaClient) {}

  /** Ghi reservation đã được processor và application service xác minh. */
  create(data: Prisma.MediaAssetUncheckedCreateInput, tx: DatabaseTransaction) {
    return tx.mediaAsset.create({ data });
  }

  /** Đọc asset trong transaction bảo vệ hoặc kiểm tra sau claim của worker. */
  get(id: string, tx?: DatabaseTransaction) {
    return (tx ?? this.db).mediaAsset.findUnique({ where: { id } });
  }

  /** Inventory tra về metadata bằng key được server sinh, không nhận khóa từ request. */
  byKey(storageKey: string) {
    return this.db.mediaAsset.findUnique({ where: { storageKey } });
  }

  /** Service chỉ gửi những trường vòng đời đã kiểm tra và ID opaque. */
  update(id: string, data: Prisma.MediaAssetUpdateInput, tx: DatabaseTransaction) {
    return tx.mediaAsset.update({ where: { id }, data });
  }

  /** Lấy đồng hồ thực sau chờ khóa và thao tác storage có thể chậm. */
  async now(tx: DatabaseTransaction): Promise<Date> {
    const [row] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    if (!row) throw new Error("Database clock unavailable");
    return row.now;
  }

  /** Chọn batch chưa hoàn tất, không để tombstone cũ chiếm mãi các slot của upload mới. */
  expired() {
    return this.db.mediaAsset.findMany({
      where: {
        purpose: "CHAT",
        deletedAt: null,
        OR: [{ status: "TEMP", expiresAt: { lte: new Date() } }, { status: "DELETING" }],
      },
      take: 20,
      orderBy: { id: "asc" },
    });
  }

  /** Claim recheck dưới khóa User→Conversation→Media, không thể xóa ảnh vừa attach. */
  claim(candidate: { id: string; uploadedById: string; chatConversationId: string | null }) {
    return this.db.$transaction(async (tx) => {
      await lockResources(tx, [`user:${candidate.uploadedById}`]);
      if (candidate.chatConversationId)
        await lockResources(tx, [`conversation:${candidate.chatConversationId}`]);
      await lockResources(tx, [`media:${candidate.id}`]);
      const asset = await this.get(candidate.id, tx);
      if (!asset || asset.status === "ATTACHED") return null;
      if (asset.status === "TEMP" && (!asset.expiresAt || asset.expiresAt > (await this.now(tx))))
        return null;
      const claimed = await this.update(asset.id, { status: "DELETING" }, tx);
      const [version] = await tx.$queryRaw<
        Array<{ token: string }>
      >`SELECT xmin::text AS token FROM media_assets WHERE id=${asset.id}::uuid`;
      if (!version) throw new Error("Missing chat media claim");
      return { ...claimed, cleanupVersion: version.token };
    });
  }

  /** Tombstone sau xóa vật lý; ghi muộn chủ động mở lại cleanup bằng abandon(). */
  deleted(id: string, userId: string, cleanupVersion: string) {
    return this.db.$transaction(async (tx) => {
      await lockResources(tx, [`user:${userId}`]);
      await lockResources(tx, [`media:${id}`]);
      const [version] = await tx.$queryRaw<
        Array<{ token: string }>
      >`SELECT xmin::text AS token FROM media_assets WHERE id=${id}::uuid`;
      if (version?.token !== cleanupVersion) return;
      await tx.mediaAsset.updateMany({
        where: { id, status: "DELETING" },
        data: { deletedAt: new Date(), expiresAt: null },
      });
    });
  }

  /** Bên upload lỗi mở lại cleanup sau khi thao tác ghi đã kết thúc, kể cả worker đã hoàn tất trước. */
  abandon(id: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      await lockResources(tx, [`user:${userId}`]);
      await lockResources(tx, [`media:${id}`]);
      await tx.mediaAsset.updateMany({
        where: { id, uploadedById: userId, purpose: "CHAT", status: { not: "ATTACHED" } },
        data: { status: "DELETING", deletedAt: null },
      });
    });
  }
}
