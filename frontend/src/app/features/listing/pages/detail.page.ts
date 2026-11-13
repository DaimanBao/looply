import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { SessionService } from '../../../core/auth/session.service';
import { apiError } from '../../../core/http/api-error';
import { ListingApi } from '../data-access/listing.api';
import { ListingGallery } from '../components/listing-gallery';
import { ListingPrice } from '../components/listing-price';
import type { ListingDetail } from '../models/listing.models';

@Component({
  imports: [DatePipe, RouterLink, ListingGallery, ListingPrice],
  templateUrl: './detail.page.html',
  styleUrl: './detail.page.scss',
})
export class DetailPage {
  private readonly api = inject(ListingApi);
  private readonly session = inject(SessionService);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  private readonly revision = signal(0);
  // Token changes invalidate identity-sensitive content; normal rotations preserve the identity number.
  private readonly identity = computed(() => {
    this.session.token();
    return this.session.identityVersion();
  });
  readonly listing = signal<ListingDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly unavailable = signal(false);
  readonly typeLabels = { SALE: 'Bán', RENT: 'Cho thuê', EXCHANGE: 'Trao đổi' };

  /** Cancels old route/identity reads and removes previously authorized detail before fetching again. */
  constructor() {
    effect((onCleanup) => {
      const id = this.params()?.get('listingId');
      const identity = this.identity();
      this.revision();
      untracked(() => {
        this.listing.set(null);
        this.error.set('');
        this.unavailable.set(false);
        this.loading.set(true);
      });
      if (!id) return;
      const request = untracked(() => this.api.detail(id)).subscribe({
        next: (listing) => {
          if (identity !== this.session.identityVersion()) return;
          this.listing.set(listing);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (identity !== this.session.identityVersion()) return;
          this.unavailable.set(
            error instanceof HttpErrorResponse && [403, 404].includes(error.status),
          );
          this.error.set(apiError(error));
          this.loading.set(false);
        },
      });
      onCleanup(() => request.unsubscribe());
    });
  }
  /** Retries transient detail failures without changing the route. */
  retry(): void {
    this.revision.update((revision) => revision + 1);
  }
}
