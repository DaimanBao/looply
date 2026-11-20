import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SessionService } from './core/auth/session.service';
import { ActionState } from './shared/ui/action-state';
import { Feedback } from './shared/ui/feedback';
import { NotificationCenter } from './features/notification/public-api';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Feedback, NotificationCenter],
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

  /** Giữ lỗi thu hồi hiển thị để có thể thử lại đăng xuất an toàn. */
  async logout(): Promise<void> {
    await this.logoutState.run(async () => {
      await firstValueFrom(this.session.logout());
      await this.router.navigateByUrl('/auth/login');
    });
  }
}
