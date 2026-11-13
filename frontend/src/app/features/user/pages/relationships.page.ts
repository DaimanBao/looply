import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { PublicProfile } from '../../../core/http/api.models';
import { ActionState } from '../../../shared/ui/action-state';
import { Feedback } from '../../../shared/ui/feedback';
import { UserApi } from '../data-access/user.api';
import { Avatar } from '../components/avatar';
import { apiError } from '../../../core/http/api-error';

@Component({
  imports: [RouterLink, Feedback, Avatar],
  templateUrl: './relationships.page.html',
})
export class RelationshipsPage {
  private readonly api = inject(UserApi);
  private readonly route = inject(ActivatedRoute);
  readonly kind =
    this.route.snapshot.data['kind'] === 'blocked'
      ? 'blocked'
      : this.route.snapshot.data['kind'] === 'followers'
        ? 'followers'
        : 'following';
  private id = 'me';
  private revision = 0;
  readonly state = new ActionState();
  readonly profiles = signal<PublicProfile[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly selected = signal<PublicProfile | null>(null);

  /** Phản hồi tham số route tái sử dụng và bỏ mọi response danh sách hồ sơ cũ. */
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.id = params.get('userId') || 'me';
      void this.reload();
    });
  }

  /** Thay cả hàng và cursor sau thay đổi quan hệ. */
  async reload(): Promise<void> {
    const revision = ++this.revision;
    this.profiles.set([]);
    this.cursor.set(null);
    this.selected.set(null);
    this.state.busy.set(true);
    this.state.error.set('');
    try {
      const page = await this.api.related(this.id, this.kind);
      if (revision === this.revision) {
        this.profiles.set(page.data);
        this.cursor.set(page.pagination.nextCursor);
      }
    } catch (error) {
      if (revision === this.revision) this.state.error.set(apiError(error));
    } finally {
      if (revision === this.revision) this.state.busy.set(false);
    }
  }

  /** Thêm ID không trùng và giữ cursor do server cung cấp. */
  async loadMore(): Promise<void> {
    const cursor = this.cursor();
    if (!cursor) return;
    const revision = this.revision;
    await this.state.run(async () => {
      const page = await this.api.related(this.id, this.kind, cursor);
      if (revision !== this.revision) return;
      const existing = new Set(this.profiles().map((profile) => profile.id));
      this.profiles.update((profiles) => [
        ...profiles,
        ...page.data.filter((profile) => !existing.has(profile.id)),
      ]);
      this.cursor.set(page.pagination.nextCursor);
    });
  }

  /** Xóa một Block thuộc bên gọi sau xác nhận và đặt lại phân trang. */
  async unblock(user: PublicProfile): Promise<void> {
    await this.state.run(async () => {
      await this.api.relationship(user.id, 'block', false);
      this.selected.set(null);
      const page = await this.api.related(this.id, 'blocked');
      this.profiles.set(page.data);
      this.cursor.set(page.pagination.nextCursor);
    }, 'Đã bỏ chặn. Quan hệ theo dõi không tự khôi phục.');
  }
}
