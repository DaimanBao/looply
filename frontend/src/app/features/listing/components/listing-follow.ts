import { Component, effect, inject, input, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListingFollowState } from '../state/listing-follow.state';
import type { ListingItem } from '../models/listing.models';

@Component({
  selector: 'app-listing-follow',
  imports: [RouterLink],
  templateUrl: './listing-follow.html',
})
export class ListingFollow {
  readonly state = inject(ListingFollowState);
  readonly listing = input.required<ListingItem>();

  /** Các card chia sẻ một lần đọc chủ sở hữu; xoay token cùng danh tính không gọi lại. */
  constructor() {
    effect(() => {
      this.state.identity();
      untracked(() => void this.state.prepareOwner());
    });
  }
}
