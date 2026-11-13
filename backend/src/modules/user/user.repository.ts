import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";

/** Tạo cùng điều kiện chặn hai chiều cho hồ sơ, danh sách quan hệ và truy cập feature. */
export function visibleUserWhere(viewerId?: string): Prisma.UserWhereInput {
  return {
    status: "ACTIVE",
    ...(viewerId
      ? {
          NOT: {
            OR: [
              { blockingRelations: { some: { blockedId: viewerId } } },
              { blockedRelations: { some: { blockerId: viewerId } } },
            ],
          },
        }
      : {}),
  };
}
/** Cung cấp cùng kiểm tra vòng đời/Block cho SQL tham số hóa của feature; bên gọi truyền biểu thức ID do server quản lý. */
export function visibleUserSql(userId: Prisma.Sql, viewerId?: string): Prisma.Sql {
  return Prisma.sql`EXISTS (SELECT 1 FROM users visible_user WHERE visible_user.id = ${userId} AND visible_user.status = 'ACTIVE'
    ${viewerId ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b."blockerId" = visible_user.id AND b."blockedId" = ${viewerId}::uuid) OR (b."blockedId" = visible_user.id AND b."blockerId" = ${viewerId}::uuid))` : Prisma.empty})`;
}
export class UserRepository {
  /** Dùng chung Prisma pool ứng dụng; không tạo kết nối toàn cục module. */
  constructor(private readonly db: PrismaClient) {}

  /** Quản lý ranh giới database nguyên tử cho thay đổi hồ sơ và quan hệ. */
  transaction<T>(run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(run, { timeout: 15000 });
  }

  /** Dùng khóa User chuẩn chung với Auth, worker và cổng thay đổi Chat/Listing tương lai. */
  lock(tx: DatabaseTransaction, ids: string[]): Promise<void> {
    return lockResources(
      tx,
      ids.map((id) => `user:${id.toLowerCase()}`),
    );
  }

  /** Lấy dữ liệu hồ sơ và số quan hệ thực trong một truy vấn ORM. */
  profile(id: string, tx: DatabaseTransaction = this.db) {
    return tx.user.findUnique({
      where: { id },
      include: {
        province: { select: { code: true, name: true } },
        _count: { select: { followerRelations: true, followingRelations: true } },
      },
    });
  }

  /** Chỉ tra tài khoản được hiển thị khi truy cập hồ sơ công khai. */
  visible(id: string, viewerId?: string, tx: DatabaseTransaction = this.db) {
    return tx.user.findFirst({
      where: { id, ...visibleUserWhere(viewerId) },
      select: { id: true },
    });
  }

  /** Kết hợp hiển thị và chọn hồ sơ trong một câu lệnh, tránh race giữa kiểm tra và đọc. */
  visibleProfile(id: string, viewerId?: string) {
    return this.db.user.findFirst({
      where: { id, ...visibleUserWhere(viewerId) },
      include: {
        province: { select: { code: true, name: true } },
        _count: { select: { followerRelations: true, followingRelations: true } },
      },
    });
  }

  /** Tra cả kiểm tra Province hoạt động và danh mục tham chiếu công khai từ PostgreSQL. */
  provinces() {
    return this.db.province.findMany({
      where: { isActive: true },
      select: { code: true, name: true },
      orderBy: { code: "asc" },
    });
  }

  /** Từ chối mã không hoạt động hoặc không tồn tại trước khi gán FK. */
  province(code: string, tx: DatabaseTransaction) {
    return tx.province.findFirst({ where: { code, isActive: true }, select: { id: true } });
  }

  /** Chỉ cập nhật trường hồ sơ do service chọn; không nhận dữ liệu HTTP tùy ý làm đầu vào Prisma. */
  update(id: string, data: Prisma.UserUpdateInput, tx: DatabaseTransaction) {
    return tx.user.update({ where: { id }, data });
  }

  /** Áp dụng thời gian chờ username bằng điều kiện database, tránh race giữa kiểm tra và ghi. */
  username(id: string, username: string, tx: DatabaseTransaction) {
    return tx.user.updateMany({
      where: {
        id,
        status: "ACTIVE",
        OR: [
          { usernameChangedAt: null },
          { usernameChangedAt: { lte: new Date(Date.now() - 30 * 86400000) } },
        ],
      },
      data: { username, usernameChangedAt: new Date() },
    });
  }

  /** Kiểm tra chặn hai chiều nhưng giữ hàng chặn có hướng của từng chủ sở hữu. */
  blocked(left: string, right: string, tx: DatabaseTransaction = this.db) {
    return tx.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: left, blockedId: right },
          { blockerId: right, blockedId: left },
        ],
      },
      select: { id: true },
    });
  }

  /** Theo dõi idempotent bằng khóa unique ghép hiện có. */
  follow(from: string, to: string, tx: DatabaseTransaction) {
    return tx.userFollow.upsert({
      where: { followerId_followingId: { followerId: from, followingId: to } },
      create: { followerId: from, followingId: to },
      update: {},
    });
  }

  /** Chỉ xóa hướng theo dõi thuộc bên gọi. */
  unfollow(from: string, to: string, tx: DatabaseTransaction) {
    return tx.userFollow.deleteMany({ where: { followerId: from, followingId: to } });
  }

  /** Xóa Follow hai chiều nguyên tử cùng thêm Block. */
  async block(from: string, to: string, tx: DatabaseTransaction): Promise<void> {
    await tx.userFollow.deleteMany({
      where: {
        OR: [
          { followerId: from, followingId: to },
          { followerId: to, followingId: from },
        ],
      },
    });
    await tx.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: from, blockedId: to } },
      create: { blockerId: from, blockedId: to },
      update: {},
    });
  }

  /** Không xóa Block độc lập của User khác hoặc khôi phục Follow khi bỏ chặn. */
  unblock(from: string, to: string, tx: DatabaseTransaction) {
    return tx.userBlock.deleteMany({ where: { blockerId: from, blockedId: to } });
  }

  /** Phân trang bằng UUID bất biến với truy vấn giới hạn; lọc quan hệ User đã chọn phía server. */
  related(
    id: string,
    kind: "followers" | "following" | "blocked",
    limit: number,
    after?: string,
    viewerId?: string,
  ) {
    const relation: Prisma.UserWhereInput =
      kind === "followers"
        ? { followingRelations: { some: { followingId: id } } }
        : kind === "following"
          ? { followerRelations: { some: { followerId: id } } }
          : { blockedRelations: { some: { blockerId: id } } };
    return this.db.user.findMany({
      where: {
        ...relation,
        ...(kind === "blocked" ? { status: "ACTIVE" } : visibleUserWhere(viewerId)),
        ...(after ? { id: { gt: after } } : {}),
      },
      include: {
        province: { select: { code: true, name: true } },
        _count: { select: { followerRelations: true, followingRelations: true } },
      },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
  }
}
