import { Component, effect, inject, input, signal } from '@angular/core';
import { ChatApi } from '../data-access/chat.api';
import { SessionService } from '../../../core/auth/session.service';

@Component({
  selector: 'app-chat-image',
  template: `@if (url()) {
      <img [src]="url()" [alt]="alt()" loading="lazy" />
    } @else {
      <span class="muted">{{ failed() ? 'Ảnh không còn khả dụng' : 'Đang tải ảnh…' }}</span>
    }`,
  styleUrl: './chat-image.scss',
  host: { '[class.compact]': 'compact()' },
})
export class ChatImage {
  private readonly api = inject(ChatApi);
  private readonly session = inject(SessionService);
  readonly path = input.required<string>();
  readonly alt = input('Ảnh trong hội thoại');
  readonly compact = input(false);
  readonly url = signal('');
  readonly failed = signal(false);

  /** Hủy request/blob khi đổi ảnh hoặc danh tính, không để ảnh private cũ tồn tại sau đăng xuất. */
  constructor() {
    effect((onCleanup) => {
      this.session.token();
      const identity = this.session.identityVersion();
      this.url.set('');
      this.failed.set(false);
      let objectUrl = '';
      const subscription = this.api.image(this.path()).subscribe({
        next: (blob) => {
          if (identity !== this.session.identityVersion()) return;
          objectUrl = URL.createObjectURL(blob);
          this.url.set(objectUrl);
        },
        error: () => {
          if (identity === this.session.identityVersion()) this.failed.set(true);
        },
      });
      onCleanup(() => {
        subscription.unsubscribe();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      });
    });
  }
}
