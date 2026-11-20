import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../../../core/http/api.config';
import { record } from '../../../core/http/api.decode';
import type { ReminderField } from '../models/reminder.models';

/** Từ chối mã lạ, trùng hoặc response sai cấu trúc trước khi hiển thị liên kết trong shell. */
export function decodeReminders(value: unknown): ReminderField[] {
  const items = record(value)['items'];
  if (!Array.isArray(items) || items.length > 3) throw new Error('Lời nhắc không hợp lệ.');
  const result: ReminderField[] = [];
  for (const item of items) {
    if (item !== 'PHONE' && item !== 'EMAIL' && item !== 'PROVINCE')
      throw new Error('Lời nhắc không hợp lệ.');
    if (result.includes(item)) throw new Error('Lời nhắc bị trùng.');
    result.push(item);
  }
  return result;
}

@Injectable({ providedIn: 'root' })
export class ReminderApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE)}/reminders`;

  /** Cấp lượt hiển thị phía server, không gửi định danh tài khoản hoặc phiên từ client. */
  async present(): Promise<ReminderField[]> {
    return decodeReminders(
      await firstValueFrom(this.http.post<unknown>(`${this.base}/presentation`, {})),
    );
  }

  /** Tính lại mục thiếu sau cập nhật hồ sơ, không cấp thêm lượt hiển thị. */
  async evaluate(): Promise<ReminderField[]> {
    return decodeReminders(await firstValueFrom(this.http.get<unknown>(this.base)));
  }
}
