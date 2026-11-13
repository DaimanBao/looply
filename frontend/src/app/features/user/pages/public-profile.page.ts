import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { PublicProfile } from '../../../core/http/api.models';
import { SessionService } from '../../../core/auth/session.service';
import { ActionState } from '../../../shared/ui/action-state';
import { Feedback } from '../../../shared/ui/feedback';
import { UserApi } from '../data-access/user.api';
import { Avatar } from '../components/avatar';
import { apiError } from '../../../core/http/api-error';

@Component({
  imports: [RouterLink, Feedback, Avatar],
  template: `
    <section class="card">
      <app-feedback [state]="state" />
      @if (state.error()) {
        <button class="secondary" (click)="load()">Tải lại hồ sơ</button>
      }
      @if (profile(); as user) {
        <div class="profile-hero">
          <app-avatar [profile]="user" />
          <div>
            <span class="eyebrow">THÀNH VIÊN LOOPLY</span>
            <h1>{{ user.displayName }}</h1>
            <p class="muted">
              {{ user.username ? '@' + user.username : 'Tài khoản đã xóa' }} ·
              {{ user.province?.name || 'Chưa cập nhật khu vực' }}
            </p>
            <p class="bio">{{ user.bio || 'Thành viên chưa thêm giới thiệu.' }}</p>
            <div class="stats">
              <a [routerLink]="['/users', user.id, 'followers']"
                ><strong>{{ user.followers }}</strong> người theo dõi</a
              ><a [routerLink]="['/users', user.id, 'following']"
                ><strong>{{ user.following }}</strong> đang theo dõi</a
              >
            </div>
          </div>
        </div>
        @if (auth.active() && !isOwner()) {
          <div class="actions">
            <button
              class="primary"
              (click)="relationship('follow', true)"
              [disabled]="state.busy()"
            >
              Theo dõi</button
            ><button class="secondary" (click)="confirm.set('unfollow')">Bỏ theo dõi</button
            ><button class="danger-outline" (click)="confirm.set('block')">Chặn tài khoản</button>
          </div>
        }
        @if (!auth.authenticated()) {
          <p class="notice">
            <a routerLink="/auth/login">Đăng nhập</a> để theo dõi hoặc quản lý tương tác.
          </p>
        }
        @if (isOwner()) {
          <p><a routerLink="/account">Quản lý hồ sơ của tôi →</a></p>
        }
      }
      @if (confirm(); as action) {
        <div class="notice" role="region" aria-label="Xác nhận thao tác">
          <p>
            {{
              action === 'block'
                ? 'Chặn sẽ xóa theo dõi hai chiều và ẩn hồ sơ của nhau. Lịch sử Chat vẫn được giữ.'
                : 'Bạn có chắc muốn bỏ theo dõi tài khoản này?'
            }}
          </p>
          <button
            class="danger"
            (click)="relationship(action === 'block' ? 'block' : 'follow', action === 'block')"
            [disabled]="state.busy()"
          >
            Xác nhận</button
          ><button class="secondary" (click)="confirm.set(null)">Hủy</button>
        </div>
      }
      @if (blocked()) {
        <p class="notice">
          Đã chặn tài khoản. Quản lý tại <a routerLink="/account/blocked">danh sách đã chặn</a>.
        </p>
      }
    </section>
  `,
})
export class PublicProfilePage {
  private readonly api = inject(UserApi);
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(SessionService);
  readonly state = new ActionState();
  readonly profile = signal<PublicProfile | null>(null);
  readonly isOwner = signal(false);
  readonly blocked = signal(false);
  readonly confirm = signal<'unfollow' | 'block' | null>(null);
  private id = '';
  private revision = 0;
  /** Follows parameter changes when Angular reuses this page between two profiles. */
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.id = params.get('userId') || '';
      void this.load();
    });
  }
  /** Removes stale visible fields before retrying block-aware authorization. */
  async load(): Promise<void> {
    const revision = ++this.revision;
    this.profile.set(null);
    this.isOwner.set(false);
    this.blocked.set(false);
    this.confirm.set(null);
    this.state.error.set('');
    this.state.busy.set(true);
    try {
      const user = await this.api.profile(this.id);
      const owner = this.auth.active() ? await this.api.me() : null;
      if (revision === this.revision) {
        this.isOwner.set(owner?.id === user.id);
        this.profile.set(user);
      }
    } catch (error) {
      if (revision === this.revision) this.state.error.set(apiError(error));
    } finally {
      if (revision === this.revision) this.state.busy.set(false);
    }
  }
  /** Uses explicit idempotent actions because the contract has no viewer relationship flags. */
  async relationship(kind: 'follow' | 'block', enabled: boolean): Promise<void> {
    const id = this.id;
    const revision = this.revision;
    await this.state.run(
      async () => {
        await this.api.relationship(id, kind, enabled);
        if (revision !== this.revision) return;
        this.confirm.set(null);
        if (kind === 'block') {
          this.profile.set(null);
          this.blocked.set(true);
        } else {
          const profile = await this.api.profile(id);
          if (revision === this.revision) this.profile.set(profile);
        }
      },
      kind === 'block' ? 'Đã chặn tài khoản.' : enabled ? 'Đã theo dõi.' : 'Đã bỏ theo dõi.',
    );
    if (revision === this.revision && this.state.error()) {
      this.profile.set(null);
      this.confirm.set(null);
    }
  }
}
