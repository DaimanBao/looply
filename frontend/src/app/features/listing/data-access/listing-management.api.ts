import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { API_BASE } from '../../../core/http/api.config';
import type { ListingInput } from '../models/listing-management.models';
import { decodeListingDetail, decodeListingPage } from './listing.decode';

@Injectable({ providedIn: 'root' })
export class ListingManagementApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE);

  /** Chỉ nhận bài của danh tính hiện tại, bao gồm HIDDEN và cursor opaque. */
  mine(ownerId: string, status: '' | 'ACTIVE' | 'HIDDEN', after?: string) {
    const params: Record<string, string> = { limit: '12' };
    if (status) params['status'] = status;
    if (after) params['after'] = after;
    return this.http
      .get<unknown>(`${this.base}/users/me/listings`, { params })
      .pipe(map((value) => decodeListingPage(value, ownerId)));
  }

  /** Tạo bài cùng manifest cuối, không tự phát lại POST khi mất kết nối. */
  create(input: ListingInput) {
    return this.http.post<unknown>(`${this.base}/listings`, input).pipe(map(decodeListingDetail));
  }

  /** Giữ phiên bản đọc ban đầu làm hàng rào chống ghi đè từ editor khác. */
  update(
    id: string,
    input: ListingInput,
    expectedVersion: number,
    confirmConversationImpact: boolean,
  ) {
    return this.http
      .patch<unknown>(`${this.base}/listings/${encodeURIComponent(id)}`, {
        ...input,
        expectedVersion,
        confirmConversationImpact,
      })
      .pipe(map(decodeListingDetail));
  }

  /** Ẩn/hiện bằng endpoint riêng và xác nhận mở lại đã được người dùng chọn. */
  visibility(
    id: string,
    expectedVersion: number,
    status: 'ACTIVE' | 'HIDDEN',
    confirmReopenAfterAccepted: boolean,
  ) {
    return this.http
      .patch<unknown>(`${this.base}/listings/${encodeURIComponent(id)}/visibility`, {
        expectedVersion,
        status,
        confirmReopenAfterAccepted,
      })
      .pipe(map(decodeListingDetail));
  }

  /** Xóa mềm chỉ sau xác nhận, không gọi endpoint hủy TEMP cho media đã gắn. */
  remove(id: string, expectedVersion: number) {
    return this.http.delete<void>(`${this.base}/listings/${encodeURIComponent(id)}`, {
      body: { expectedVersion, confirmDelete: true },
    });
  }
}
