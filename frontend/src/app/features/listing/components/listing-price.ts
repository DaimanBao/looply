import { Component, computed, input } from '@angular/core';
import type { ListingItem } from '../models/listing.models';

@Component({ selector: 'app-listing-price', template: `{{ label() }}` })
export class ListingPrice {
  readonly listing = input.required<ListingItem>();
  readonly label = computed(() => {
    const listing = this.listing();
    if (listing.type === 'EXCHANGE') return 'Trao đổi';
    const price = new Intl.NumberFormat('vi-VN').format(BigInt(listing.price ?? '0'));
    const unit =
      listing.type === 'RENT' ? (listing.rentalUnit === 'DAY' ? ' / ngày' : ' / tháng') : '';
    return `${price} ₫${unit}`;
  });
}
