import { signal } from '@angular/core';
import { apiError } from '../../core/http/api-error';

/** Owns the loading/feedback lifecycle of a single visible user action. */
export class ActionState {
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  /** Prevents duplicate submissions and always releases the loading state. */
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
