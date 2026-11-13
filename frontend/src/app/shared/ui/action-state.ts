import { signal } from '@angular/core';
import { apiError } from '../../core/http/api-error';

/** Quản lý vòng đời loading/phản hồi của một hành động người dùng hiển thị. */
export class ActionState {
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');

  /** Ngăn gửi trùng và luôn giải phóng trạng thái loading. */
  async run(action: () => Promise<void>, success = ''): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await action();
      this.message.set(success);
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
