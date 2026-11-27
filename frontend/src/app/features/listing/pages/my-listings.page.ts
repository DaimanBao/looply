import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { UserApi } from '../../user/public-api';
import { ListingManagementApi } from '../data-access/listing-management.api';
import { ListingMedia } from '../components/listing-media';
import { ListingPrice } from '../components/listing-price';
import { listingError } from '../data-access/listing-error';
import type { ListingItem } from '../models/listing.models';
import { Subscription } from 'rxjs';

@Component({
  imports: [RouterLink, ListingMedia, ListingPrice],
  templateUrl: './my-listings.page.html',
  styleUrl: './my-listings.page.scss',
})
export class MyListingsPage {
  private readonly api = inject(ListingManagementApi);
  private readonly user = inject(UserApi);
  private readonly session = inject(SessionService);
  private readonly identity = computed(() => {
    this.session.token();
    return this.session.identityVersion();
  });
  private ownerId = '';
  private epoch = 0;
  private request?: Subscription;
  readonly rows = signal<ListingItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly cursor = signal<string | null>(null);
  readonly status = signal<'' | 'ACTIVE' | 'HIDDEN'>('');
  readonly saved = inject(ActivatedRoute).snapshot.queryParamMap.has('saved');

  /** Xóa danh sách cũ khi đổi danh tính/filter và hủy request lúc rời trang. */
  constructor() {
    effect((onCleanup) => {
      this.identity();
      this.status();
      const epoch = ++this.epoch;
      untracked(() => {
        this.request?.unsubscribe();
        this.rows.set([]);
        this.cursor.set(null);
        this.ownerId = '';
        this.loading.set(true);
        this.error.set('');
        if (this.session.active()) void this.initialize(epoch);
      });
      onCleanup(() => {
        this.epoch++;
        this.request?.unsubscribe();
      });
    });
  }

  /** Nạp thêm hoặc retry đúng cursor hiện tại, loại trùng theo ID. */
  load(): void {
    if (this.loading() || !this.ownerId) return;
    const epoch = this.epoch;
    const identity = this.session.identityVersion();
    this.loading.set(true);
    this.error.set('');
    this.request = this.api
      .mine(this.ownerId, this.status(), this.cursor() ?? undefined)
      .subscribe({
        next: (page) => {
          if (!this.isCurrent(epoch, identity)) return;
          this.rows.update((rows) => [
            ...rows,
            ...page.data.filter((row) => !rows.some((old) => old.id === row.id)),
          ]);
          this.cursor.set(page.pagination.nextCursor);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (!this.isCurrent(epoch, identity)) return;
          this.error.set(listingError(error));
          this.loading.set(false);
        },
      });
  }

  /** Retry cả bước đọc danh tính nếu bước khởi tạo trước thất bại. */
  retry(): void {
    if (this.ownerId) this.load();
    else void this.initialize(this.epoch);
  }

  /** Catalog quyền sở hữu lấy từ /users/me, không suy diễn JWT phía client. */
  private async initialize(epoch: number): Promise<void> {
    const identity = this.session.identityVersion();
    this.loading.set(true);
    this.error.set('');
    try {
      const profile = await this.user.me();
      if (!this.isCurrent(epoch, identity)) return;
      this.ownerId = profile.id;
      this.loading.set(false);
      this.load();
    } catch (error) {
      if (!this.isCurrent(epoch, identity)) return;
      this.error.set(listingError(error));
      this.loading.set(false);
    }
  }

  /** Từ chối cả kết quả đọc hồ sơ và trang của filter hoặc tài khoản đã đổi. */
  private isCurrent(epoch: number, identity: number): boolean {
    return epoch === this.epoch && identity === this.session.identityVersion();
  }
}
