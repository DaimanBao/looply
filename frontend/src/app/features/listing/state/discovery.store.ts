import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { apiError } from '../../../core/http/api-error';
import { ListingApi } from '../data-access/listing.api';
import type { DiscoveryQuery } from '../models/discovery-query';
import type { ListingItem } from '../models/listing.models';

@Injectable()
export class DiscoveryStore {
  private readonly api = inject(ListingApi);
  private request?: Subscription;
  private query: DiscoveryQuery | null = null;
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
    this.cancel();
    this.query = query;
    this.started = false;
    this.items.set([]);
    this.cursor.set(null);
    this.error.set('');
    this.finished.set(false);
    if (query) this.loadMore();
  }

  /** Lấy từng trang một, giữ thông tin phân trang sau lỗi để thử lại tường minh. */
  loadMore(): void {
    if (!this.query || this.loading() || this.finished()) return;
    this.loading.set(true);
    this.error.set('');
    const revision = this.revision;
    this.request = this.api
      .discover(this.query, this.started ? (this.cursor() ?? undefined) : undefined)
      .subscribe({
        next: (page) => {
          if (revision !== this.revision) return;
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
          if (revision !== this.revision) return;
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
