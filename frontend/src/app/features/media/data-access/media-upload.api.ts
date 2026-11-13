import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { API_BASE } from '../../../core/http/api.config';
import { record } from '../../../core/http/api.decode';

export interface MediaUpload {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  expiresAt: string;
}

/** Kiểm tra TEMP sẵn sàng, loại thực tế và thời hạn trước khi dùng ID trong manifest. */
export function decodeUpload(value: unknown): MediaUpload {
  const row = record(value);
  const id = row['id'];
  const type = row['type'];
  const expiresAt = row['expiresAt'];
  const duration = row['durationSeconds'];
  const validType =
    type === 'IMAGE'
      ? row['mimeType'] === 'image/webp' && duration === null
      : type === 'VIDEO' &&
        ['video/mp4', 'video/webm'].includes(String(row['mimeType'])) &&
        typeof duration === 'number' &&
        Number.isInteger(duration) &&
        duration >= 1 &&
        duration <= 180;
  if (
    row['status'] !== 'TEMP' ||
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
    typeof expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    !validType ||
    typeof row['sizeBytes'] !== 'string' ||
    !/^[1-9][0-9]*$/.test(row['sizeBytes'])
  ) {
    throw new Error('Phản hồi upload không hợp lệ.');
  }
  return { id, type: type === 'IMAGE' ? 'IMAGE' : 'VIDEO', expiresAt };
}

@Injectable({ providedIn: 'root' })
export class MediaUploadApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE);

  /** Gửi byte thô qua Auth interceptor; cho phép xử lý video lâu hơn request JSON. */
  upload(file: File) {
    return this.http
      .post<unknown>(`${this.base}/media/listing-uploads`, file, {
        headers: { 'Content-Type': 'application/octet-stream' },
        timeout: 240000,
      })
      .pipe(map(decodeUpload));
  }

  /** Hủy đúng TEMP của uploader; Backend quyết định tệp đã ATTACHED có thể hủy hay không. */
  cancel(id: string) {
    return this.http.delete<void>(`${this.base}/media/listing-uploads/${encodeURIComponent(id)}`);
  }
}
