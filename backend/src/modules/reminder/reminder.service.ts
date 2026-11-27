import type { Principal, ScriptStore } from "../auth";
import { authSessionLifetimeSeconds, forbidden } from "../auth";
import type { UserService } from "../user";

type ReminderField = "PHONE" | "EMAIL" | "PROVINCE";
type ReminderProfile = {
  phone: string | null;
  phoneVerifiedAt: Date | null;
  email: string | null;
  emailVerifiedAt: Date | null;
  province: { code: string } | null;
};

const reservePresentation =
  "return redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[1]) and 1 or 0";

/** Chỉ nhắc ba thông tin đã duyệt; liên hệ chưa xác minh vẫn còn thiếu. */
export function missingProfileFields(profile: ReminderProfile): ReminderField[] {
  const fields: ReminderField[] = [];
  if (!profile.phone || !profile.phoneVerifiedAt) fields.push("PHONE");
  if (!profile.email || !profile.emailVerifiedAt) fields.push("EMAIL");
  if (!profile.province) fields.push("PROVINCE");
  return fields;
}

export class ReminderService {
  /** Phụ thuộc cổng hồ sơ công khai, không truy cập repository hoặc credential nội bộ của User. */
  constructor(
    private readonly users: Pick<UserService, "me">,
    private readonly store: ScriptStore,
    private readonly prefix: string,
  ) {}

  /** Tính lại từ hồ sơ hiện tại, không ghi trạng thái hoặc tiêu thụ lượt nhắc. */
  async evaluate(principal: Principal) {
    const profile = await this.users.me(principal);
    if (profile.status !== "ACTIVE") throw forbidden();
    return { items: missingProfileFields(profile) };
  }

  /** Chỉ cấp lượt khi hồ sơ còn thiếu; không tạo Notification hoặc sửa dữ liệu hồ sơ. */
  async present(principal: Principal) {
    const result = await this.evaluate(principal);
    if (!result.items.length) return result;
    // Redis cấp một lượt giữa các tab; refresh giữ sessionId và cùng khóa.
    const granted = await this.store.eval(
      reservePresentation,
      [`${this.prefix}reminder:presentation:${principal.userId}:${principal.sessionId}`],
      [String(authSessionLifetimeSeconds)],
    );
    return granted === 1 ? result : { items: [] };
  }
}
