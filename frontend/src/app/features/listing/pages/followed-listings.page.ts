import { Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListingCard } from '../components/listing-card';
import { DiscoveryStore } from '../state/discovery.store';
import { ListingFollowState } from '../state/listing-follow.state';

@Component({
  imports: [RouterLink, ListingCard],
  providers: [DiscoveryStore],
  templateUrl: './followed-listings.page.html',
  styleUrl: './followed-listings.page.scss',
})
export class FollowedListingsPage {
  readonly store = inject(DiscoveryStore);
  readonly follows = inject(ListingFollowState);
  readonly rows = computed(() =>
    this.store.items().filter((listing) => this.follows.followed(listing)),
  );

  /** Mỗi danh tính có cursor riêng; hủy và xóa dữ liệu ngay khi logout/login tài khoản khác. */
  constructor() {
    effect(() => {
      this.follows.identity();
      const active = this.follows.session.active();
      untracked(() => this.store.reset(active ? 'followed' : null));
    });
  }

  /** Đọc lại danh sách từ server để cập nhật visibility và quan hệ đổi ở tab khác. */
  reload(): void {
    if (!this.store.loading() && this.follows.session.active()) this.store.reset('followed');
  }
}
