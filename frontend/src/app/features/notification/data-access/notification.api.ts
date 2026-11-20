import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, map } from 'rxjs';
import { API_BASE } from '../../../core/http/api.config';
import { record } from '../../../core/http/api.decode';
import type { NotificationItem } from '../models/notification.models';
import { decodeNotificationPage, notificationId } from './notification.decode';

@Injectable({ providedIn: 'root' })
export class NotificationApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE)}/notifications`;

  /** Tải trang qua interceptor Auth hiện có. */
  list(after?: string) {
    return firstValueFrom(
      this.http
        .get<unknown>(this.base, { params: { limit: 30, ...(after ? { after } : {}) } })
        .pipe(map(decodeNotificationPage)),
    );
  }

  /** Badge từ server, từ chối số âm hoặc không nguyên. */
  async count(): Promise<number> {
    const row = record(await firstValueFrom(this.http.get<unknown>(`${this.base}/unread-count`)));
    const count = row['count'];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
      throw new Error('Số thông báo không hợp lệ.');
    return count;
  }

  /** Không đọc nhầm một event mới vừa được gộp sau khi UI hiển thị. */
  read(item: NotificationItem) {
    return firstValueFrom(
      this.http.put<void>(`${this.base}/${item.id}/read`, { expectedEventId: item.lastEventId }),
    );
  }

  /** Đánh dấu tới mốc do server cung cấp, không tạo thời gian từ client. */
  readAll(through: string) {
    return firstValueFrom(this.http.put<void>(`${this.base}/read-all`, { through }));
  }

  /** Xóa mềm chỉ notification, không xóa dữ liệu đích. */
  remove(id: string) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/${id}`));
  }

  /** Đích được server kiểm tra quyền hiện tại; client không dùng URL tùy ý. */
  async target(id: string) {
    const row = record(await firstValueFrom(this.http.get<unknown>(`${this.base}/${id}/target`)));
    return {
      conversationId: notificationId(row['conversationId']),
      messageId: row['messageId'] === null ? null : notificationId(row['messageId']),
    };
  }
}
