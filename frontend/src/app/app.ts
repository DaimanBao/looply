import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SessionService } from './core/auth/session.service';
import { sessionDestination } from './core/auth/session-destination';
import { ActionState } from './shared/ui/action-state';
import { Feedback } from './shared/ui/feedback';
import { NotificationCenter } from './features/notification/public-api';
import { ReminderCard } from './features/reminder/public-api';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Feedback, NotificationCenter, ReminderCard],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly logoutState = new ActionState();

  /** Rời màn hình riêng khi thu hồi hoặc cookie hết hạn làm mất quyền phía client. */
  constructor() {
    effect(() => {
      if (!this.session.authenticated() && this.router.url.startsWith('/account'))
        void this.router.navigateByUrl('/auth/login');
    });
  }

  /** Quay về trang đang chờ sau khi phiên được khôi phục tại màn hình đăng nhập. */
  async retrySession(): Promise<void> {
    const url = this.router.url;
    const onLogin = this.router.isActive('/auth/login', {
      paths: 'exact',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
    const restored = await this.session.restore();
    if (!restored || !onLogin || this.router.url !== url) return;

    const requested = this.router.parseUrl(url).queryParamMap.get('returnUrl');
    await this.router.navigateByUrl(sessionDestination(this.session.status(), requested), {
      replaceUrl: true,
    });
  }

  /** Giữ lỗi thu hồi hiển thị để có thể thử lại đăng xuất an toàn. */
  async logout(): Promise<void> {
    await this.logoutState.run(async () => {
      await firstValueFrom(this.session.logout());
      await this.router.navigateByUrl('/auth/login');
    });
  }
}
