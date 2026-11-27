import type { PrismaClient, Prisma, User } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";
// SQL index dùng cùng tập khoảng trắng ECMAScript trim(), giữ nguyên dấu chấm và +suffix.
const emailTrimCharacters =
  " \t\n\r\f\v\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

export class AuthRepository {
  /** Dùng Prisma pool chung; service truyền transaction client tường minh. */
  constructor(private readonly db: PrismaClient) {}

  /** Giữ mọi thay đổi thông tin xác thực/phiên trong đơn vị công việc nguyên tử của bên gọi. */
  transaction<T>(run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(run, { timeout: 15000 });
  }

  /** Tuần tự hóa thay đổi phiên và thông tin xác thực cùng thay đổi User/tài khoản. */
  lock(tx: DatabaseTransaction, userId: string, extra: string[] = []): Promise<void> {
    return lockResources(tx, [`user:${userId.toLowerCase()}`, ...extra]);
  }

  /** Khóa định danh email trước, rồi khóa các User liên quan theo UUID trước khi vô hiệu hóa khai báo trùng. */
  async lockContact(tx: DatabaseTransaction, userId: string, destination: string): Promise<void> {
    if (!destination.includes("@")) {
      await this.lock(tx, userId, [`phone:${destination}`]);
      return;
    }
    await lockResources(tx, [`email:${destination}`]);
    const declarations = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM users WHERE "emailVerifiedAt" IS NULL AND lower(btrim(email, ${emailTrimCharacters}))=${destination}`;
    await lockResources(tx, [
      ...declarations.map((user) => `user:${user.id}`),
      `user:${userId.toLowerCase()}`,
    ]);
  }

  /** Tìm định danh nội bộ duy nhất; chủ động loại email khỏi tra cứu duy nhất. */
  user(
    where: Prisma.UserWhereUniqueInput,
    tx: DatabaseTransaction = this.db,
  ): Promise<User | null> {
    return tx.user.findUnique({ where });
  }

  /** Chỉ tìm liên hệ thuộc sở hữu đã xác minh để khôi phục, đăng nhập điện thoại hoặc liên kết tài khoản. */
  async contact(destination: string, tx: DatabaseTransaction = this.db): Promise<User | null> {
    if (!destination.includes("@"))
      return tx.user.findFirst({ where: { phone: destination, phoneVerifiedAt: { not: null } } });
    const rows = await tx.$queryRaw<
      User[]
    >`SELECT * FROM users WHERE "emailVerifiedAt" IS NOT NULL AND lower(btrim(email, ${emailTrimCharacters})) = ${destination} LIMIT 1`;
    return rows[0] ?? null;
  }

  /** Chỉ tra Google theo provider subject, không theo email do client cung cấp. */
  google(subject: string, tx: DatabaseTransaction = this.db) {
    return tx.googleAccount.findUnique({
      where: { googleSubject: subject },
      include: { user: true },
    });
  }

  /** Tìm subject đã liên kết để xác thực lại. */
  googleForUser(userId: string, tx: DatabaseTransaction = this.db) {
    return tx.googleAccount.findUnique({ where: { userId } });
  }

  /** Yêu cầu mục danh mục đang hoạt động trước khi đăng ký nội bộ. */
  province(code: string, tx: DatabaseTransaction = this.db) {
    return tx.province.findFirst({ where: { code, isActive: true } });
  }

  /** Tạo User từ thông tin xác thực/hồ sơ đã xác minh khi đăng ký. */
  createUser(data: Prisma.UserUncheckedCreateInput, tx: DatabaseTransaction) {
    return tx.user.create({ data });
  }

  /** Tạo một định danh Google cho mỗi User theo ràng buộc duy nhất của subject và User. */
  linkGoogle(userId: string, subject: string, tx: DatabaseTransaction) {
    return tx.googleAccount.create({ data: { userId, googleSubject: subject } });
  }

  /** Chỉ lưu digest của refresh token, không lưu bearer token. */
  createSession(
    userId: string,
    refreshTokenHash: string,
    expiresAt: Date,
    tx: DatabaseTransaction,
  ) {
    return tx.authSession.create({ data: { userId, refreshTokenHash, expiresAt } });
  }

  /** Tra phiên bằng refresh token hoặc access token cùng trạng thái tài khoản hiện tại. */
  session(where: Prisma.AuthSessionWhereUniqueInput, tx: DatabaseTransaction = this.db) {
    return tx.authSession.findUnique({ where, include: { user: true } });
  }

  /** Thực hiện refresh compare-and-swap nguyên tử ngay cả khi hai yêu cầu mang cùng cookie. */
  rotate(id: string, oldHash: string, newHash: string, tx: DatabaseTransaction) {
    return tx.authSession.updateMany({
      where: { id, refreshTokenHash: oldHash, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { refreshTokenHash: newHash, tokenVersion: { increment: 1 }, lastUsedAt: new Date() },
    });
  }

  /** Thu hồi các phiên của User, có thể giữ phiên gọi đổi mật khẩu. */
  revoke(userId: string, tx: DatabaseTransaction, except?: string) {
    return tx.authSession.updateMany({
      where: { userId, revokedAt: null, ...(except ? { id: { not: except } } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  /** Thu hồi idempotent chỉ phiên thuộc bên gọi. */
  revokeOne(userId: string, id: string) {
    return this.db.authSession.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Chỉ trả metadata phiên an toàn, loại refresh digest và phiên bản token. */
  sessions(userId: string) {
    return this.db.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, lastUsedAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Cập nhật dữ liệu mật khẩu trong cùng transaction thu hồi phiên. */
  password(userId: string, passwordHash: string, tx: DatabaseTransaction) {
    return tx.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  /** Chỉ xóa thông tin xác thực do Auth sở hữu trong transaction của bộ điều phối xóa. */
  async erase(userId: string, tx: DatabaseTransaction): Promise<void> {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await tx.authSession.deleteMany({ where: { userId } });
    await tx.googleAccount.deleteMany({ where: { userId } });
    await tx.otpChallenge.deleteMany({
      where: {
        OR: [
          { userId },
          ...(user.email ? [{ destination: user.email }] : []),
          ...(user.phone ? [{ destination: user.phone }] : []),
        ],
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash: null,
        email: null,
        emailVerifiedAt: null,
        phone: null,
        phoneVerifiedAt: null,
      },
    });
  }

  /** Xác minh quyền sở hữu nguyên tử và xóa khai báo chưa xác minh bị xung đột. */
  async verifiedContact(
    userId: string,
    destination: string,
    tx: DatabaseTransaction,
  ): Promise<void> {
    if (destination.includes("@")) {
      await tx.$executeRaw`UPDATE users SET email=NULL, "updatedAt"=NOW() WHERE "emailVerifiedAt" IS NULL AND id<>${userId}::uuid AND lower(btrim(email, ${emailTrimCharacters}))=${destination}`;
      await tx.user.update({
        where: { id: userId },
        data: { email: destination, emailVerifiedAt: new Date() },
      });
    } else {
      await tx.user.update({
        where: { id: userId },
        data: { phone: destination, phoneVerifiedAt: new Date() },
      });
    }
  }
}
