import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Observable, Subscription, defer, tap } from 'rxjs';
import { apiError } from '../../../core/http/api-error';
import { ListingApi } from '../data-access/listing.api';
import type { DiscoveryQuery } from '../models/discovery-query';
import type { ListingItem, ListingPage } from '../models/listing.models';
import { ListingFollowApi } from '../data-access/listing-follow.api';
import { ListingFollowState } from './listing-follow.state';

@Injectable()
export class DiscoveryStore {
  private readonly api = inject(ListingApi);
  private readonly followApi = inject(ListingFollowApi);
  private readonly follows = inject(ListingFollowState);
  private request?: Subscription;
  private source: ((after?: string) => Observable<ListingPage>) | null = null;
  private revision = 0;
  private started = false;
  readonly items = signal<ListingItem[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly finished = signal(false);

  /** Hủy yêu cầu khi store theo phạm vi trang bị hủy. */
  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancel());
  }

  /** Xóa trạng thái gắn query ngay, kể cả khi tìm kiếm đã đổi đang debounce. */
  reset(query: DiscoveryQuery | null): void {
    this.resetSource(query ? (after) => this.api.discover(query, after) : null);
  }

  /** Dùng cùng cursor/dedup/retry cho scope theo dõi, không thay đổi query khám phá. */
  resetFollowed(): void {
    this.resetSource((after) =>
      defer(() => {
        const read = this.follows.beginRead();
        return this.followApi
          .followed(after)
          .pipe(tap((page) => this.follows.accept(page.data, read)));
      }),
    );
  }

  /** Đặt lại nguồn trang và vô hiệu hóa request/cursor cũ trong một lượt. */
  private resetSource(source: ((after?: string) => Observable<ListingPage>) | null): void {
    this.cancel();
    this.source = source;
    this.started = false;
    this.items.set([]);
    this.cursor.set(null);
    this.error.set('');
    this.finished.set(false);
    if (source) this.loadMore();
  }

  /** Lấy từng trang một, giữ thông tin phân trang sau lỗi để thử lại tường minh. */
  loadMore(): void {
    if (!this.source || this.loading() || this.finished()) return;
    this.loading.set(true);
    this.error.set('');
    const revision = this.revision;
    const identity = this.follows.session.identityVersion();
    this.request = this.source(this.started ? (this.cursor() ?? undefined) : undefined).subscribe({
      next: (page) => {
        if (revision !== this.revision || identity !== this.follows.session.identityVersion())
          return;
        const seen = new Set(this.items().map((listing) => listing.id));
        const additions = page.data.filter((listing) => {
          if (seen.has(listing.id)) return false;
          seen.add(listing.id);
          return true;
        });
        this.items.update((items) => [...items, ...additions]);
        this.cursor.set(page.pagination.nextCursor);
        this.finished.set(page.pagination.nextCursor === null);
        this.started = true;
        this.loading.set(false);
      },
      error: (error: unknown) => {
        if (revision !== this.revision || identity !== this.follows.session.identityVersion())
          return;
        this.error.set(apiError(error));
        this.loading.set(false);
      },
    });
  }

  /** Vô hiệu hóa callback và hủy đăng ký HTTP observable có thể hủy. */
  private cancel(): void {
    this.revision++;
    this.request?.unsubscribe();
    this.loading.set(false);
  }
}
