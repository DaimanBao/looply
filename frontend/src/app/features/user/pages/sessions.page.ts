import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { AuthSession } from '../../../core/http/api.models';
import { SessionService } from '../../../core/auth/session.service';
import { ActionState } from '../../../shared/ui/action-state';
import { Feedback } from '../../../shared/ui/feedback';
import { UserApi } from '../data-access/user.api';

@Component({
  imports: [RouterLink, Feedback, DatePipe],
  templateUrl: './sessions.page.html',
})
export class SessionsPage implements OnInit {
  private readonly api = inject(UserApi);
  private readonly auth = inject(SessionService);
  private readonly router = inject(Router);
  readonly state = new ActionState();
  readonly sessions = signal<AuthSession[]>([]);
  readonly selected = signal<AuthSession | null>(null);

  /** Nạp metadata phiên chỉ dành cho chủ sở hữu khi vào trang. */
  ngOnInit(): void {
    void this.load();
  }

  /** Làm mới danh sách hiển thị sau thu hồi từ ngoài hoặc local. */
  async load(): Promise<void> {
    await this.state.run(async () => {
      this.sessions.set(await this.api.sessions());
    });
  }

  /** Xóa quyền local ngay khi phiên chọn là phiên hiện tại. */
  async revoke(session: AuthSession): Promise<void> {
    await this.state.run(async () => {
      await this.api.revoke(session.id);
      this.selected.set(null);
      if (session.current) {
        this.auth.clear();
        await this.router.navigateByUrl('/auth/login');
      } else this.sessions.set(await this.api.sessions());
    }, 'Đã thu hồi phiên.');
  }
}
