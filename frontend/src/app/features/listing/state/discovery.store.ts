import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { apiError } from '../../../core/http/api-error';
import { ListingApi } from '../data-access/listing.api';
import type { DiscoveryQuery } from '../models/discovery-query';
import type { ListingItem } from '../models/listing.models';
import { ListingFollowApi } from '../data-access/listing-follow.api';
import { ListingFollowState } from './listing-follow.state';

@Injectable()
export class DiscoveryStore {
  private readonly api = inject(ListingApi);
  private readonly followApi = inject(ListingFollowApi);
  private readonly follows = inject(ListingFollowState);
  private request?: Subscription;
  private source: DiscoveryQuery | 'followed' | null = null;
  private revision = 0;
  // undefined là trang đầu, null là đã hết trang, string là mốc tiếp tục.
  private readonly nextCursor = signal<string | null | undefined>(undefined);
  readonly items = signal<ListingItem[]>([]);
  readonly cursor = computed(() => this.nextCursor() ?? null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly finished = computed(() => this.nextCursor() === null);

  /** Hủy yêu cầu khi store theo phạm vi trang bị hủy. */
  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancel());
  }

  /** Đổi nguồn trang và hủy request cũ ngay, kể cả lúc query mới đang debounce. */
  reset(source: DiscoveryQuery | 'followed' | null): void {
    this.cancel();
    this.source = source;
    this.items.set([]);
    this.nextCursor.set(undefined);
    this.error.set('');
    if (source) this.loadMore();
  }

  /** Lấy từng trang một, giữ thông tin phân trang sau lỗi để thử lại tường minh. */
  loadMore(): void {
    const source = this.source;
    const after = this.nextCursor();
    if (!source || this.loading() || after === null) return;
    this.loading.set(true);
    this.error.set('');
    const revision = this.revision;
    const identity = this.follows.session.identityVersion();
    const followRead = source === 'followed' ? this.follows.beginRead() : null;
    const request =
      source === 'followed' ? this.followApi.followed(after) : this.api.discover(source, after);
    this.request = request.subscribe({
      next: (page) => {
        if (followRead) this.follows.accept(page.data, followRead);
        if (revision !== this.revision || identity !== this.follows.session.identityVersion())
          return;
        const seen = new Set(this.items().map((listing) => listing.id));
        const additions = page.data.filter((listing) => {
          if (seen.has(listing.id)) return false;
          seen.add(listing.id);
          return true;
        });
        this.items.update((items) => [...items, ...additions]);
        this.nextCursor.set(page.pagination.nextCursor);
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
