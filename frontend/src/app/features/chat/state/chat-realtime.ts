import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { io } from 'socket.io-client';
import { SessionService } from '../../../core/auth/session.service';
import { API_BASE } from '../../../core/http/api.config';

@Injectable({ providedIn: 'root' })
export class ChatRealtime {
  private readonly session = inject(SessionService);
  private readonly document = inject(DOCUMENT);
  private readonly base = inject(API_BASE);
  readonly revision = signal(0);
  readonly connected = signal(false);
  readonly error = signal('');

  /** Vòng đời socket gắn credential hiện tại; phản hồi tài khoản cũ không tác động UI mới. */
  constructor() {
    effect((onCleanup) => {
      const token = this.session.token();
      const active = this.session.active();
      this.connected.set(false);
      this.error.set('');
      if (!token || !active) return;
      const version = this.session.identityVersion();
      const origin = new URL(this.base, this.document.baseURI).origin;
      const socket = io(`${origin}/chat`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        timeout: 10000,
      });
      let refreshing = false;
      /** Chỉ xử lý thông báo còn thuộc phiên và token đã mở socket. */
      const current = () =>
        this.session.identityVersion() === version && this.session.token() === token;
      socket.on('connect', () => {
        if (!current()) return;
        this.connected.set(true);
        this.error.set('');
        this.revision.update((value) => value + 1);
      });
      socket.on('chat.changed', () => {
        if (current()) this.revision.update((value) => value + 1);
      });
      socket.on('disconnect', (reason) => {
        if (!current()) return;
        this.connected.set(false);
        this.error.set('Đã ngắt kết nối. Đang thử kết nối lại…');
        if (reason === 'io server disconnect')
          this.session
            .refresh()
            .subscribe({
              error: () => this.error.set('Phiên đã hết hạn. Vui lòng đăng nhập lại.'),
            });
      });
      socket.on('connect_error', (error: Error) => {
        if (!current()) return;
        this.error.set('Chưa kết nối được Chat. Bạn có thể tải lại nội dung.');
        if (error.message === 'UNAUTHENTICATED' && !refreshing) {
          refreshing = true;
          this.session
            .refresh()
            .subscribe({
              error: () => this.error.set('Phiên đã hết hạn. Vui lòng đăng nhập lại.'),
            });
        }
      });
      onCleanup(() => {
        socket.removeAllListeners();
        socket.disconnect();
      });
    });
  }
}
