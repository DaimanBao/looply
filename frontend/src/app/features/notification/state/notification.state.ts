import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SessionService } from '../../../core/auth/session.service';
import { apiError } from '../../../core/http/api-error';
import { ChatRealtime } from '../../chat/public-api';
import { NotificationApi } from '../data-access/notification.api';
import type { NotificationItem } from '../models/notification.models';

@Injectable({ providedIn: 'root' })
export class NotificationState {
  private readonly api = inject(NotificationApi);
  private readonly session = inject(SessionService);
  private readonly realtime = inject(ChatRealtime);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private identity = -1;
  private revision = 0;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private asOf = '';
  readonly items = signal<NotificationItem[]>([]);
  readonly count = signal(0);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly toast = signal<string | null>(null);

  /** Một store theo identity; reconnect/focus tải REST, không replay toast offline. */
  constructor() {
    effect(() => {
      this.session.token();
      const active = this.session.active();
      const identity = this.session.identityVersion();
      this.realtime.notificationRevision();
      untracked(() => {
        if (!active || identity !== this.identity) this.reset(identity);
        if (active) void this.refresh();
      });
    });
    this.realtime.notifications.pipe(takeUntilDestroyed()).subscribe((id) => {
      if (!this.session.active()) return;
      if (id && this.toast() !== id) {
        this.toast.set(id);
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => this.dismissToast(), 6000);
      }
      void this.refresh();
    });
    /** Focus chỉ resync khi phiên còn ACTIVE. */
    const visible = () => {
      if (this.document.visibilityState === 'visible' && this.session.active()) void this.refresh();
    };
    this.document.addEventListener('visibilitychange', visible);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', visible);
      clearTimeout(this.toastTimer);
    });
  }

  /** Bỏ toàn bộ dữ liệu cá nhân và pending flags khi đổi hoặc mất tài khoản. */
  private reset(identity: number): void {
    this.identity = identity;
    this.revision++;
    this.items.set([]);
    this.count.set(0);
    this.nextCursor.set(null);
    this.loading.set(false);
    this.loadingMore.set(false);
    this.busy.set(false);
    this.error.set('');
    this.asOf = '';
    this.dismissToast();
  }

  /** Chặn response của tài khoản cũ ngay cả trước khi effect reset chạy. */
  private current(identity: number, revision?: number): boolean {
    return (
      this.session.active() &&
      this.session.identityVersion() === identity &&
      (revision === undefined || revision === this.revision)
    );
  }

  /** Invalidation reset cursor vì tập dữ liệu read/delete/new có thể thay đổi giữa requests. */
  async refresh(): Promise<void> {
    if (!this.session.active()) return;
    const identity = this.session.identityVersion();
    const revision = ++this.revision;
    this.loading.set(true);
    this.loadingMore.set(false);
    try {
      const [page, count] = await Promise.all([this.api.list(), this.api.count()]);
      if (!this.current(identity, revision)) return;
      this.items.set(page.data);
      this.nextCursor.set(page.pagination.nextCursor);
      this.asOf = page.asOf;
      this.count.set(count);
      this.error.set('');
    } catch (error) {
      if (this.current(identity, revision)) this.error.set(apiError(error));
    } finally {
      if (this.current(identity, revision)) this.loading.set(false);
    }
  }

  /** Trang cũ không được ghép sau resync/mutation/đổi tài khoản. */
  async more(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore() || this.loading() || this.busy()) return;
    const identity = this.session.identityVersion();
    const revision = this.revision;
    this.loadingMore.set(true);
    try {
      const page = await this.api.list(cursor);
      if (!this.current(identity, revision)) return;
      const ids = new Set(this.items().map((item) => item.id));
      this.items.update((items) => [...items, ...page.data.filter((item) => !ids.has(item.id))]);
      this.nextCursor.set(page.pagination.nextCursor);
    } catch (error) {
      if (this.current(identity, revision)) this.error.set(apiError(error));
    } finally {
      if (this.current(identity, revision)) this.loadingMore.set(false);
    }
  }

  /** Một mutation tại một thời điểm, mọi kết quả kể cả điều hướng đều gắn identity. */
  private async mutate(run: (identity: number) => Promise<void>): Promise<void> {
    if (!this.session.active() || this.busy()) return;
    const identity = this.session.identityVersion();
    this.busy.set(true);
    this.revision++;
    this.loadingMore.set(false);
    this.error.set('');
    try {
      await run(identity);
      if (this.current(identity)) await this.refresh();
    } catch (error) {
      if (this.current(identity)) {
        await this.refresh();
        if (this.current(identity))
          this.error.set(
            error instanceof HttpErrorResponse && error.status === 409
              ? 'Thông báo vừa có hoạt động mới. Danh sách đã tải lại; vui lòng chọn lại.'
              : apiError(error),
          );
      }
    } finally {
      if (this.current(identity)) this.busy.set(false);
    }
  }

  /** Đọc riêng không chỉnh cursor Chat. */
  read(item: NotificationItem): Promise<void> {
    return this.mutate(async () => {
      await this.api.read(item);
    });
  }

  /** Đọc toàn bộ chỉ tới boundary trang hiện tại. */
  readAll(): Promise<void> {
    if (!this.asOf) return Promise.resolve();
    return this.mutate(async () => {
      await this.api.readAll(this.asOf);
    });
  }

  /** Xóa không thay đổi lịch sử Chat hoặc nội dung bài đăng. */
  remove(item: NotificationItem): Promise<void> {
    return this.mutate(async () => {
      await this.api.remove(item.id);
    });
  }

  /** Resolve đích rồi đọc đúng boundary; lỗi đích hiển thị tại trang hiện tại. */
  open(item: NotificationItem): Promise<void> {
    return this.mutate(async (identity) => {
      const target = await this.api.target(item.id);
      if (!this.current(identity)) return;
      await this.api.read(item);
      if (!this.current(identity)) return;
      this.dismissToast();
      await this.router.navigate(['/chat', target.conversationId], {
        queryParams: target.messageId ? { messageId: target.messageId } : {},
      });
    });
  }

  /** Đóng toast không gọi API read/delete. */
  dismissToast(): void {
    clearTimeout(this.toastTimer);
    this.toast.set(null);
  }
}
