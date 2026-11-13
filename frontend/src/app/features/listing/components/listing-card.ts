import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ListingItem } from '../models/listing.models';
import { ListingMedia } from './listing-media';
import { ListingPrice } from './listing-price';
import { ListingFollow } from './listing-follow';

@Component({
  selector: 'app-listing-card',
  imports: [DatePipe, RouterLink, ListingMedia, ListingPrice, ListingFollow],
  templateUrl: './listing-card.html',
  styleUrl: './listing-card.scss',
})
export class ListingCard {
  readonly listing = input.required<ListingItem>();
  readonly typeLabels = { SALE: 'Bán', RENT: 'Cho thuê', EXCHANGE: 'Trao đổi' };
}
