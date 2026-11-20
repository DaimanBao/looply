import type { Principal } from "../auth";
import { forbidden } from "../auth";
import type { UserService } from "../user";
import { missingProfileFields } from "./reminder.policy";
import type { ReminderPresentationStore } from "./reminder-presentation.store";

export class ReminderService {
  /** Phụ thuộc cổng hồ sơ công khai, không truy cập repository hoặc credential nội bộ của User. */
  constructor(
    private readonly users: Pick<UserService, "me">,
    private readonly presentations: ReminderPresentationStore,
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
    if (!result.items.length || !(await this.presentations.reserve(principal)))
      return { items: [] };
    return result;
  }
}
