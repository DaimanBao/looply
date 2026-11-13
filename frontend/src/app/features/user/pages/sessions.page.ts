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
  template: `
    <p><a routerLink="/account">← Tài khoản</a></p>
    <section class="card">
      <div class="page-heading">
        <div>
          <h1>Phiên đăng nhập</h1>
          <p class="muted">Kiểm soát quyền truy cập trên các thiết bị của bạn.</p>
        </div>
        <button class="secondary" (click)="load()" [disabled]="state.busy()">Tải lại</button>
      </div>
      <app-feedback [state]="state" />
      @for (session of sessions(); track session.id) {
        <article class="list-row">
          <div>
            <h2>{{ session.current ? 'Phiên hiện tại' : 'Phiên đăng nhập khác' }}</h2>
            <p class="muted">
              Tạo {{ session.createdAt | date: 'dd/MM/yyyy HH:mm' }} · Hết hạn
              {{ session.expiresAt | date: 'dd/MM/yyyy HH:mm' }}
            </p>
            <small
              >Lần sử dụng gần nhất:
              {{ (session.lastUsedAt | date: 'dd/MM/yyyy HH:mm') || 'Chưa có' }}</small
            >
          </div>
          <button class="danger-outline" (click)="selected.set(session)" [disabled]="state.busy()">
            Thu hồi
          </button>
        </article>
      } @empty {
        @if (!state.busy() && !state.error()) {
          <p class="empty">Không có phiên đang hoạt động.</p>
        }
      }
      @if (selected(); as session) {
        <div class="notice" role="region" aria-label="Xác nhận thu hồi phiên">
          <p>
            {{
              session.current
                ? 'Bạn sẽ bị đăng xuất khỏi phiên hiện tại.'
                : 'Thiết bị này sẽ không thể tiếp tục truy cập.'
            }}
          </p>
          <button class="danger" (click)="revoke(session)" [disabled]="state.busy()">
            Xác nhận thu hồi</button
          ><button class="secondary" (click)="selected.set(null)">Hủy</button>
        </div>
      }
    </section>
  `,
})
export class SessionsPage implements OnInit {
  private readonly api = inject(UserApi);
  private readonly auth = inject(SessionService);
  private readonly router = inject(Router);
  readonly state = new ActionState();
  readonly sessions = signal<AuthSession[]>([]);
  readonly selected = signal<AuthSession | null>(null);
  /** Loads owner-only session metadata on entry. */
  ngOnInit(): void {
    void this.load();
  }
  /** Refreshes the visible list after external or local revocation. */
  async load(): Promise<void> {
    await this.state.run(async () => {
      this.sessions.set(await this.api.sessions());
    });
  }
  /** Clears local authority immediately when the selected session is the current one. */
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
