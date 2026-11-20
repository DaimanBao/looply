import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';
import { API_BASE } from '../../../core/http/api.config';
import { record } from '../../../core/http/api.decode';
import { decodeChatPage, decodeConversation, decodeMessage } from './chat.decode';
import type { ChatMessageInput, ChatProposalInput } from '../models/chat.models';

@Injectable({ providedIn: 'root' })
export class ChatApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE);

  /** Tạo hoặc lấy lại Conversation theo ngữ cảnh đã chọn. */
  create(input: { type: 'DIRECT'; userId: string } | { type: 'LISTING'; listingId: string }) {
    return firstValueFrom(
      this.http.post<unknown>(`${this.base}/conversations`, input).pipe(map(decodeConversation)),
    );
  }

  /** Inbox keyset có filter nhóm và Listing, không tự nối cursor giữa hai filter. */
  inbox(query: { group?: string; listingId?: string; after?: string }) {
    return firstValueFrom(
      this.http
        .get<unknown>(`${this.base}/conversations`, { params: { ...query, limit: 30 } })
        .pipe(map((value) => decodeChatPage(value, decodeConversation))),
    );
  }

  /** Đọc metadata mới nhất trước khi hiển thị quyền proposal. */
  get(id: string) {
    return firstValueFrom(
      this.http.get<unknown>(`${this.base}/conversations/${id}`).pipe(map(decodeConversation)),
    );
  }

  /** Tải lịch sử theo cursor, giữ newest-first ở ranh giới API. */
  history(id: string, after?: string) {
    return firstValueFrom(
      this.http
        .get<unknown>(`${this.base}/conversations/${id}/messages`, {
          params: { limit: 30, ...(after ? { after } : {}) },
        })
        .pipe(map((value) => decodeChatPage(value, decodeMessage))),
    );
  }

  /** Retry giữ nguyên requestId do state quản lý, không tự phát lại mutation mới. */
  send(id: string, input: ChatMessageInput) {
    return firstValueFrom(
      this.http
        .post<unknown>(`${this.base}/conversations/${id}/messages`, input)
        .pipe(map(decodeMessage)),
    );
  }

  /** Proposal lưu snapshot phía server, client chỉ gửi ý định và giá thương lượng. */
  propose(id: string, input: ChatProposalInput) {
    return firstValueFrom(
      this.http
        .post<unknown>(`${this.base}/conversations/${id}/proposals`, input, { timeout: 120000 })
        .pipe(map(decodeMessage)),
    );
  }

  /** Xử lý card bằng hành động tường minh, server quyết định vai trò và trạng thái hiện tại. */
  resolve(id: string, proposalId: string, status: 'ACCEPTED' | 'REJECTED') {
    return firstValueFrom(
      this.http
        .patch<unknown>(`${this.base}/conversations/${id}/proposals/${proposalId}`, { status })
        .pipe(map(decodeMessage)),
    );
  }

  /** Read bao hàm delivered; chỉ gọi sau khi history đã hiển thị trong trang hiện tại. */
  read(id: string, messageId: string) {
    return firstValueFrom(
      this.http.put<void>(`${this.base}/conversations/${id}/read`, { messageId }),
    );
  }

  /** Xóa mềm chỉ Inbox cá nhân, giữ toàn bộ Message lịch sử. */
  hide(id: string) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/conversations/${id}`));
  }

  /** Upload raw image theo cùng Auth interceptor với các API khác. */
  async upload(id: string, file: File): Promise<string> {
    const row = record(
      await firstValueFrom(
        this.http.post<unknown>(`${this.base}/conversations/${id}/images`, file, {
          headers: { 'Content-Type': 'application/octet-stream' },
          timeout: 120000,
        }),
      ),
    );
    if (typeof row['id'] !== 'string' || !/^[0-9a-f-]{36}$/.test(row['id']))
      throw new Error('Upload không hợp lệ.');
    return row['id'];
  }

  /** Hủy đúng upload tạm khi người dùng thay/bỏ ảnh; expiry xử lý khi mất phiên. */
  cancel(id: string, mediaId: string) {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/conversations/${id}/images/${mediaId}`),
    );
  }

  /** Đọc authenticated Blob; không gắn Bearer vào URL hoặc dùng public storage path. */
  image(path: string) {
    return this.http.get(`${this.base}${path.slice(4)}`, { responseType: 'blob' }).pipe(
      map((blob) => {
        if (blob.type !== 'image/webp' || !blob.size || blob.size > 10 * 1024 * 1024)
          throw new Error('Ảnh Chat không hợp lệ.');
        return blob;
      }),
    );
  }
}
