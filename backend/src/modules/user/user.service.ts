import type { z } from "zod";
import type { profileSchema, pageSchema } from "./user.schema";
import type { UserRepository } from "./user.repository";
import type { SessionService, Principal } from "../auth";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import { cursorPage } from "../../shared/http/pagination";
import { conflict, forbidden } from "../auth";
import type { User } from "../../generated/prisma/client";

type Profile = NonNullable<Awaited<ReturnType<UserRepository["profile"]>>>;
/** Giao diện tích hợp Chat công khai: chủ thể đã xóa không lộ username, avatar hoặc tên hiển thị cũ. */
export function historyIdentity(
  user: Pick<User, "id" | "status" | "username" | "displayName" | "avatarMediaId">,
) {
  const deleted = user.status === "DELETED";
  return {
    id: user.id,
    username: deleted ? null : user.username,
    displayName: deleted ? "Tài khoản đã xóa" : user.displayName,
    avatarUrl: !deleted && user.avatarMediaId ? `/api/users/${user.id}/avatar` : null,
  };
}
/** Chỉ tuần tự hóa dữ liệu công khai; danh tính lịch sử của chủ thể đã xóa không chứa giá trị hồ sơ cũ. */
export function publicProfile(user: Profile) {
  const deleted = user.status === "DELETED";
  return {
    ...historyIdentity(user),
    bio: deleted ? null : user.bio,
    province: deleted ? null : user.province,
    followers: user._count.followerRelations,
    following: user._count.followingRelations,
  };
}
/** Chỉ thêm trạng thái liên hệ/tài khoản riêng vào DTO tường minh của chủ sở hữu. */
export function privateProfile(user: Profile) {
  return {
    ...publicProfile(user),
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    phone: user.phone,
    phoneVerifiedAt: user.phoneVerifiedAt,
    status: user.status,
    deletionRequestedAt: user.deletionRequestedAt,
    usernameChangedAt: user.usernameChangedAt,
  };
}
export class UserService {
  /** Dùng cổng phiên công khai của Auth thay vì triển khai bộ kiểm tra danh tính thứ hai. */
  constructor(
    private readonly repository: UserRepository,
    private readonly sessions: SessionService,
  ) {}

  /** Đọc hồ sơ riêng của chủ, gồm trạng thái xóa cần cho hủy xóa tường minh. */
  async me(principal: Principal) {
    const user = await this.repository.profile(principal.userId);
    if (!user || !["ACTIVE", "PENDING_DELETION"].includes(user.status)) throw forbidden();
    return privateProfile(user);
  }

  /** Ẩn hồ sơ chờ/đang/đã xóa và hồ sơ bị chặn hai chiều với người xem đã đăng nhập. */
  async profile(userId: string, viewer?: Principal) {
    const user = await this.repository.visibleProfile(userId, viewer?.userId);
    if (!user) throw new AppError(404, "NOT_FOUND", "Profile not found.");
    return publicProfile(user);
  }

  /** Kiểm tra tỉnh phía server và chỉ cập nhật trường thuộc hồ sơ khi phiên còn hiệu lực. */
  async update(principal: Principal, input: z.infer<typeof profileSchema>) {
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, [principal.userId]);
      await this.sessions.requireCurrent(principal, tx);
      const province = input.provinceCode
        ? await this.repository.province(input.provinceCode, tx)
        : null;
      if (input.provinceCode && !province)
        throw new AppError(400, "INVALID_PROVINCE", "Choose an active province.");
      await this.repository.update(
        principal.userId,
        {
          displayName: input.displayName,
          bio: input.bio,
          ...(province ? { province: { connect: { id: province.id } } } : {}),
        },
        tx,
      );
    });
    return this.me(principal);
  }

  /** Thực thi nguyên tử quy tắc lần đổi đầu/30 ngày; PostgreSQL vẫn bảo đảm duy nhất. */
  async username(principal: Principal, username: string) {
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, [principal.userId]);
      const current = await this.sessions.requireCurrent(principal, tx);
      if (current.username === username) return;
      const result = await this.repository.username(principal.userId, username, tx);
      if (result.count !== 1) throw conflict("Wait 30 days after your last username change.");
    });
    return this.me(principal);
  }

  /** Cổng truy cập transaction công khai cho gửi Chat/Listing tương lai; giữ khóa đến khi ghi commit. */
  async requireInteraction(tx: DatabaseTransaction, from: string, to: string): Promise<void> {
    from = from.toLowerCase();
    to = to.toLowerCase();
    if (from === to) throw forbidden();
    await this.repository.lock(tx, [from, to]);
    if (
      !(await this.repository.visible(from, undefined, tx)) ||
      !(await this.repository.visible(to, undefined, tx)) ||
      (await this.repository.blocked(from, to, tx))
    )
      throw forbidden();
  }

  /** Tuần tự hóa cả hai phía với Follow/Block và xóa tài khoản; không tạo thông báo. */
  async relationship(
    principal: Principal,
    target: string,
    operation: "follow" | "unfollow" | "block" | "unblock",
  ): Promise<void> {
    target = target.toLowerCase();
    if (target === principal.userId) throw forbidden();
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, [principal.userId, target]);
      await this.sessions.requireCurrent(principal, tx);
      switch (operation) {
        case "follow":
          await this.requireInteraction(tx, principal.userId, target);
          await this.repository.follow(principal.userId, target, tx);
          break;
        case "unfollow":
          await this.repository.unfollow(principal.userId, target, tx);
          break;
        case "unblock":
          await this.repository.unblock(principal.userId, target, tx);
          break;
        case "block":
          if (!(await this.repository.visible(target, undefined, tx))) throw forbidden();
          await this.repository.block(principal.userId, target, tx);
          break;
      }
    });
  }

  /** Trả cursor ổn định và projection an toàn, không trả email/điện thoại hay credential của User khác. */
  async related(
    userId: string,
    kind: "followers" | "following" | "blocked",
    page: z.infer<typeof pageSchema>,
    viewer?: Principal,
  ) {
    if (kind === "blocked") {
      if (viewer?.userId !== userId) throw forbidden();
    } else await this.profile(userId, viewer);
    const rows = await this.repository.related(
      userId,
      kind,
      page.limit,
      page.after,
      viewer?.userId,
    );
    const data = rows.slice(0, page.limit);
    return cursorPage(
      data.map(publicProfile),
      rows.length > page.limit ? (data.at(-1)?.id ?? null) : null,
    );
  }

  /** Chỉ cung cấp danh mục Province đang hoạt động, không yêu cầu xác thực. */
  provinces() {
    return this.repository.provinces();
  }
}
