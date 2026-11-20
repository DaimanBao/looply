import { Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { apiError } from '../../../core/http/api-error';
import { UserApi } from '../../user/public-api';
import { ChatApi } from '../data-access/chat.api';

@Component({
  selector: 'app-start-chat',
  template: `<button type="button" class="primary" [disabled]="busy()" (click)="start()">
      {{ busy() ? 'Đang mở…' : 'Nhắn tin' }}
    </button>
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    }`,
})
export class StartChat {
  private readonly api = inject(ChatApi);
  private readonly users = inject(UserApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly listingId = input<string>();
  readonly userId = input.required<string>();
  readonly busy = signal(false);
  readonly error = signal('');

  /** Khách đi tới đăng nhập với returnUrl; không tự gửi card hoặc tin nhắn sau đăng nhập. */
  async start(): Promise<void> {
    if (this.busy()) return;
    if (!this.session.active()) {
      await this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    const identity = this.session.identityVersion();
    this.busy.set(true);
    this.error.set('');
    try {
      const me = await this.users.me();
      if (identity !== this.session.identityVersion()) return;
      if (me.id === this.userId()) throw new Error('Bạn không thể nhắn tin với chính mình.');
      const listingId = this.listingId();
      const row = await this.api.create(
        listingId ? { type: 'LISTING', listingId } : { type: 'DIRECT', userId: this.userId() },
      );
      if (identity === this.session.identityVersion())
        await this.router.navigate(['/chat', row.id]);
    } catch (error) {
      if (identity === this.session.identityVersion()) this.error.set(apiError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
