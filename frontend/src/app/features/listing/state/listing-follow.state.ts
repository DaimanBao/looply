import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { apiError } from '../../../core/http/api-error';
import { UserApi } from '../../user/public-api';
import { ListingFollowApi } from '../data-access/listing-follow.api';
import type { ListingItem } from '../models/listing.models';

interface FollowEntry {
  followed: boolean;
  busy: boolean;
  error: string;
  revision: number;
}
export interface FollowRead {
  identity: number;
  revision: number;
}

@Injectable({ providedIn: 'root' })
export class ListingFollowState {
  readonly session = inject(SessionService);
  private readonly api = inject(ListingFollowApi);
  private readonly users = inject(UserApi);
  private readonly entries = signal<Record<string, FollowEntry>>({});
  private readonly requests = new Map<string, Subscription>();
  private generation = -1;
  private revision = 0;
  readonly ownerId = signal<string | null>(null);
  readonly ownerLoading = signal(false);
  readonly ownerError = signal('');
  readonly identity = computed(() => {
    this.session.token();
    return this.session.identityVersion();
  });

  /** Xóa cache/quyền và hủy observer khi đổi danh tính; token rotation không làm mất trạng thái. */
  constructor() {
    effect(() => {
      const identity = this.identity();
      untracked(() => this.synchronize(identity));
    });
  }

  /** Đóng dấu lúc bắt đầu GET để response cũ không ghi đè mutation đã thành công. */
  beginRead(): FollowRead {
    this.synchronize(this.session.identityVersion());
    return { identity: this.generation, revision: ++this.revision };
  }

  /** Chấp nhận snapshot mới trừ khi đã có GET/mutation mới hơn hoặc mutation đang chạy. */
  accept(rows: readonly ListingItem[], read: FollowRead): void {
    if (read.identity !== this.session.identityVersion() || read.identity !== this.generation)
      return;
    this.entries.update((entries) => {
      const next = { ...entries };
      for (const row of rows) {
        const entry = next[row.id];
        if (entry && (entry.busy || entry.revision > read.revision)) continue;
        next[row.id] = {
          followed: row.isFollowed,
          busy: false,
          error: '',
          revision: read.revision,
        };
      }
      return next;
    });
  }

  /** Dùng trạng thái chung thay projection cũ; guest không thừa hưởng Follow từ tài khoản trước. */
  followed(listing: ListingItem): boolean {
    this.identity();
    return this.session.active() && this.generation === this.session.identityVersion()
      ? (this.entries()[listing.id]?.followed ?? false)
      : false;
  }

  /** Xác định quyền chủ từ /users/me, không giải mã JWT hoặc suy ra từ hasConversations. */
  isOwner(listing: ListingItem): boolean {
    this.identity();
    return (
      this.session.active() &&
      this.generation === this.session.identityVersion() &&
      this.ownerId() === listing.owner.id
    );
  }

  /** Hiển thị một khóa đang xử lý dùng chung cho mọi nút của cùng Listing. */
  busy(id: string): boolean {
    this.identity();
    return this.generation === this.session.identityVersion() && !!this.entries()[id]?.busy;
  }

  /** Lỗi của tài khoản trước không được hiển thị ở tài khoản mới. */
  error(id: string): string {
    this.identity();
    return this.generation === this.session.identityVersion()
      ? (this.entries()[id]?.error ?? '')
      : '';
  }

  /** Chỉ tải quyền một lần cho các card đồng thời; lỗi cho phép người dùng retry tường minh. */
  async prepareOwner(): Promise<void> {
    this.synchronize(this.session.identityVersion());
    if (!this.session.active() || this.ownerId() || this.ownerLoading()) return;
    const identity = this.generation;
    this.ownerLoading.set(true);
    this.ownerError.set('');
    try {
      const profile = await this.users.me();
      if (identity === this.session.identityVersion() && identity === this.generation)
        this.ownerId.set(profile.id);
    } catch (error) {
      if (identity === this.session.identityVersion() && identity === this.generation)
        this.ownerError.set(apiError(error));
    } finally {
      if (identity === this.session.identityVersion() && identity === this.generation)
        this.ownerLoading.set(false);
    }
  }

  /** Chặn self/hidden Follow và nhấn lặp; chỉ đổi UI sau 204, không tự retry mutation. */
  toggle(listing: ListingItem): void {
    this.synchronize(this.session.identityVersion());
    if (!this.session.active() || !this.ownerId() || this.isOwner(listing) || this.busy(listing.id))
      return;
    const previous = this.followed(listing);
    if (!previous && listing.status !== 'ACTIVE') return;
    const identity = this.generation;
    this.setEntry(listing.id, {
      followed: previous,
      busy: true,
      error: '',
      revision: ++this.revision,
    });
    const request = this.api.set(listing.id, !previous).subscribe({
      next: () => {
        if (identity !== this.session.identityVersion() || identity !== this.generation) return;
        this.setEntry(listing.id, {
          followed: !previous,
          busy: false,
          error: '',
          revision: ++this.revision,
        });
      },
      error: (error: unknown) => {
        if (identity !== this.session.identityVersion() || identity !== this.generation) return;
        this.setEntry(listing.id, {
          followed: previous,
          busy: false,
          error: apiError(error),
          revision: ++this.revision,
        });
      },
    });
    this.requests.set(listing.id, request);
  }

  /** Thay entry bất biến để các nút ở Discovery/Detail phản ứng cùng nhau. */
  private setEntry(id: string, entry: FollowEntry): void {
    this.entries.update((entries) => ({ ...entries, [id]: entry }));
  }

  /** Đồng bộ cả trước thao tác để không phụ thuộc thời điểm effect chạy sau logout/login. */
  private synchronize(identity: number): void {
    if (identity === this.generation) return;
    for (const request of this.requests.values()) request.unsubscribe();
    this.requests.clear();
    this.generation = identity;
    this.entries.set({});
    this.ownerId.set(null);
    this.ownerLoading.set(false);
    this.ownerError.set('');
  }
}
