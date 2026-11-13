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
  template: `
    <section class="card">
      <div class="page-heading">
        <h1>
          {{
            kind === 'blocked'
              ? 'Tài khoản đã chặn'
              : kind === 'followers'
                ? 'Người theo dõi'
                : 'Đang theo dõi'
          }}
        </h1>
        <button class="secondary" (click)="reload()" [disabled]="state.busy()">Tải lại</button>
      </div>
      <app-feedback [state]="state" />
      @for (user of profiles(); track user.id) {
        <article class="list-row">
          <app-avatar [profile]="user" />
          <div class="grow">
            @if (kind === 'blocked') {
              <strong>{{ user.displayName }}</strong>
            } @else {
              <a [routerLink]="['/users', user.id]">{{ user.displayName }}</a>
            }
            <p class="muted">{{ user.username ? '@' + user.username : 'Tài khoản đã xóa' }}</p>
          </div>
          @if (kind === 'blocked') {
            <button class="secondary" (click)="selected.set(user)" [disabled]="state.busy()">
              Bỏ chặn
            </button>
          }
        </article>
      }
      @if (!profiles().length && !state.busy() && !state.error()) {
        <div class="empty">
          <h2>Chưa có tài khoản nào</h2>
          <p>Danh sách sẽ xuất hiện ở đây khi có kết nối mới.</p>
        </div>
      }
      @if (cursor()) {
        <button class="secondary wide" (click)="loadMore()" [disabled]="state.busy()">
          Xem thêm
        </button>
      }
      @if (selected(); as user) {
        <div class="notice" role="region" aria-label="Xác nhận bỏ chặn">
          <p>Bỏ chặn {{ user.displayName }}? Quan hệ theo dõi sẽ không tự khôi phục.</p>
          <button class="primary" (click)="unblock(user)" [disabled]="state.busy()">
            Xác nhận bỏ chặn</button
          ><button class="secondary" (click)="selected.set(null)">Hủy</button>
        </div>
      }
    </section>
  `,
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
  /** Responds to reused route parameters and discards any older profile list response. */
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.id = params.get('userId') || 'me';
      void this.reload();
    });
  }
  /** Replaces rows and cursor together after relationship mutations. */
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
  /** Appends unique IDs and keeps the cursor supplied by the server. */
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
  /** Removes one caller-owned Block after confirmation and resets pagination. */
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
