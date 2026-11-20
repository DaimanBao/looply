import type { ScriptStore, Principal } from "../auth";
import { authSessionLifetimeSeconds } from "../auth";

const reserve = "return redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[1]) and 1 or 0";

export class ReminderPresentationStore {
  /** Dùng Redis đã được composition root quản lý, không tạo kết nối hay session riêng. */
  constructor(
    private readonly store: ScriptStore,
    private readonly prefix: string,
  ) {}

  /** Cấp đúng một lượt giữa các tab/request; refresh giữ nguyên sessionId nên không đặt lại lượt. */
  async reserve(principal: Principal): Promise<boolean> {
    const result = await this.store.eval(
      reserve,
      [`${this.prefix}reminder:presentation:${principal.userId}:${principal.sessionId}`],
      [String(authSessionLifetimeSeconds)],
    );
    return result === 1;
  }
}
