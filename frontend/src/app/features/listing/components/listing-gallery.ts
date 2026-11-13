import { Component, computed, input, linkedSignal } from '@angular/core';
import type { ListingDetail } from '../models/listing.models';
import { ListingMedia } from './listing-media';

@Component({
  selector: 'app-listing-gallery',
  imports: [ListingMedia],
  templateUrl: './listing-gallery.html',
  styleUrl: './listing-gallery.scss',
})
export class ListingGallery {
  readonly listing = input.required<ListingDetail>();
  readonly assets = computed(() =>
    [...this.listing().media].sort((a, b) => (a.position ?? 99) - (b.position ?? 99)),
  );
  readonly selectedId = linkedSignal(() => this.listing().cover.id);
  readonly selected = computed(
    () => this.assets().find((asset) => asset.id === this.selectedId()) ?? this.listing().cover,
  );
}
