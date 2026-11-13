import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { API_BASE } from '../../../core/http/api.config';
import { decodeListingPage } from './listing.decode';

@Injectable({ providedIn: 'root' })
export class ListingFollowApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE);

  /** PUT/DELETE idempotent chỉ tác động quan hệ của phiên hiện tại, không gửi version Listing. */
  set(id: string, followed: boolean) {
    const url = `${this.base}/listings/${encodeURIComponent(id)}/follow`;
    return followed ? this.http.put<void>(url, {}) : this.http.delete<void>(url);
  }

  /** Chỉ nhận ACTIVE đã theo dõi; cursor opaque giữ đúng scope/viewer/limit của Backend. */
  followed(after?: string) {
    const params: Record<string, string> = { limit: '12' };
    if (after) params['after'] = after;
    return this.http.get<unknown>(`${this.base}/users/me/followed-listings`, { params }).pipe(
      map((value) => {
        const page = decodeListingPage(value);
        if (page.data.some((listing) => !listing.isFollowed))
          throw new Error('Phản hồi theo dõi không hợp lệ.');
        return page;
      }),
    );
  }
}
