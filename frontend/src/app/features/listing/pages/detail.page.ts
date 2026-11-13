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
import { ListingFollow } from '../components/listing-follow';
import type { ListingDetail } from '../models/listing.models';

@Component({
  imports: [DatePipe, RouterLink, ListingGallery, ListingPrice, ListingFollow],
  templateUrl: './detail.page.html',
  styleUrl: './detail.page.scss',
})
export class DetailPage {
  private readonly api = inject(ListingApi);
  private readonly session = inject(SessionService);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  private readonly revision = signal(0);
  // Đổi token vô hiệu hóa nội dung nhạy cảm theo danh tính; luân chuyển thường giữ số danh tính.
  private readonly identity = computed(() => {
    this.session.token();
    return this.session.identityVersion();
  });
  readonly listing = signal<ListingDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly unavailable = signal(false);
  readonly typeLabels = { SALE: 'Bán', RENT: 'Cho thuê', EXCHANGE: 'Trao đổi' };

  /** Hủy đọc route/danh tính cũ và xóa chi tiết từng được cấp quyền trước khi lấy lại. */
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
      // Interceptor đọc token đang luân chuyển khi subscribe, không phải khi tạo Observable.
      const request = untracked(() =>
        this.api.detail(id).subscribe({
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
        }),
      );
      onCleanup(() => request.unsubscribe());
    });
  }

  /** Thử lại lỗi chi tiết tạm thời mà không đổi route. */
  retry(): void {
    this.revision.update((revision) => revision + 1);
  }
}
