import {
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SessionService } from '../../../core/auth/session.service';
import { ListingApi } from '../data-access/listing.api';
import type { ListingMedia as Media } from '../models/listing.models';

@Component({
  selector: 'app-listing-media',
  templateUrl: './listing-media.html',
  styleUrl: './listing-media.scss',
})
export class ListingMedia {
  private readonly api = inject(ListingApi);
  private readonly session = inject(SessionService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly identity = computed(() => {
    this.session.token();
    return this.session.identityVersion();
  });
  readonly listingId = input.required<string>();
  readonly asset = input.required<Media>();
  readonly thumbnail = input(false);
  readonly alt = input('Ảnh bài đăng');
  readonly source = signal('');
  readonly loading = signal(true);
  readonly failed = signal(false);
  private readonly retryVersion = signal(0);

  /** Cancels old byte requests and revokes Blob URLs on asset, identity, or lifecycle changes. */
  constructor() {
    effect((onCleanup) => {
      const id = this.listingId();
      const asset = this.asset();
      const thumbnail = this.thumbnail();
      this.retryVersion();
      const identity = this.identity();
      untracked(() => {
        this.source.set('');
        this.loading.set(true);
        this.failed.set(false);
      });
      if (!this.browser) return;
      let url = '';
      // Subscription runs interceptors synchronously; keep their token reads outside this effect.
      const request = untracked(() =>
        this.api.media(
          id,
          asset,
          asset.type === 'VIDEO' ? 'original' : thumbnail ? 'thumbnail' : 'detail',
        ).subscribe({
          next: (blob) => {
            if (identity !== this.session.identityVersion()) return;
            if (blob.type !== asset.mimeType) {
              this.mediaError();
              return;
            }
            url = URL.createObjectURL(blob);
            this.source.set(url);
          },
          error: () => this.mediaError(),
        }),
      );
      onCleanup(() => {
        request.unsubscribe();
        if (url) URL.revokeObjectURL(url);
      });
    });
  }
  /** Allows a failed download or decode to be retried explicitly. */
  retry(): void {
    this.retryVersion.update((version) => version + 1);
  }
  /** Reports successful native image/video decoding, beyond just HTTP completion. */
  loaded(): void {
    this.loading.set(false);
  }
  /** Replaces broken media with actionable feedback while retaining the listing. */
  mediaError(): void {
    this.loading.set(false);
    this.failed.set(true);
  }
}
