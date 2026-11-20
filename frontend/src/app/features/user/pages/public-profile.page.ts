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
import { StartChat } from '../../chat/public-api';

@Component({
  imports: [RouterLink, Feedback, Avatar, StartChat],
  templateUrl: './public-profile.page.html',
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

  /** Theo dõi đổi tham số khi Angular tái sử dụng trang giữa hai hồ sơ. */
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.id = params.get('userId') || '';
      void this.load();
    });
  }

  /** Xóa trường cũ đang hiển thị trước khi thử lại phân quyền có xét block. */
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

  /** Dùng thao tác idempotent tường minh vì contract không có cờ quan hệ người xem. */
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
