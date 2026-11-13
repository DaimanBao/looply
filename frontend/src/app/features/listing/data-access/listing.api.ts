import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE } from '../../../core/http/api.config';
import type { DiscoveryQuery } from '../models/discovery-query';
import type {
  ListingDetail,
  ListingMedia,
  ListingPage,
  ListingSuggestion,
} from '../models/listing.models';
import { decodeListingDetail, decodeListingPage, decodeSuggestions } from './listing.decode';

export const LISTING_MEDIA_TIMEOUT_MS = new InjectionToken<number>('LISTING_MEDIA_TIMEOUT_MS', {
  providedIn: 'root',
  factory: () => 120000,
});

@Injectable({ providedIn: 'root' })
export class ListingApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE);
  private readonly mediaTimeout = inject(LISTING_MEDIA_TIMEOUT_MS);

  /** Gửi lại đúng query và cursor opaque; seed toàn quốc do server quản lý trong after. */
  discover(query: DiscoveryQuery, after?: string): Observable<ListingPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) params = params.set(key, value);
    if (after) params = params.set('after', after);
    return this.http.get<unknown>(`${this.base}/listings`, { params }).pipe(map(decodeListingPage));
  }

  /** Để Backend chuẩn hóa dấu tiếng Việt và lọc quyền hiển thị. */
  suggestions(q: string): Observable<ListingSuggestion[]> {
    return this.http
      .get<unknown>(`${this.base}/listings/suggestions`, { params: { q } })
      .pipe(map(decodeSuggestions));
  }

  /** Đọc chi tiết công khai hoặc của chủ có quyền bằng hệ thống Bearer tùy chọn hiện có. */
  detail(id: string): Observable<ListingDetail> {
    return this.http
      .get<unknown>(`${this.base}/listings/${encodeURIComponent(id)}`)
      .pipe(map(decodeListingDetail));
  }

  /** Lấy byte được bảo vệ thay vì đưa credential vào URL media native. */
  media(
    listingId: string,
    asset: ListingMedia,
    variant: 'thumbnail' | 'detail' | 'original',
  ): Observable<Blob> {
    const url = `${this.base}/listings/${encodeURIComponent(listingId)}/media/${encodeURIComponent(asset.id)}`;
    return this.http.get(url, {
      responseType: 'blob',
      params: { variant },
      timeout: this.mediaTimeout,
    });
  }
}
