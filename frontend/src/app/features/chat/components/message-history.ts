import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { ChatMessage } from '../models/chat.models';
import { groupedMessages } from '../models/message-presentation';
import { ChatImage } from './chat-image';
import { TransactionCard } from './transaction-card';

@Component({
  selector: 'app-message-history',
  imports: [DatePipe, ChatImage, TransactionCard],
  templateUrl: './message-history.html',
  styleUrl: './message-history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageHistory {
  readonly messages = input.required<ChatMessage[]>();
  readonly userId = input('');
  readonly scope = input.required<string>();
  readonly target = input('');
  readonly hasOlder = input(false);
  readonly loadingOlder = input(false);
  readonly busy = input(false);
  readonly canResolve = input(false);
  readonly older = output<void>();
  readonly decision = output<{ id: string; status: 'ACCEPTED' | 'REJECTED' }>();
  readonly rows = computed(() => groupedMessages(this.messages()));
  readonly newMessages = signal(false);
  readonly states = { SENT: 'Đã gửi', DELIVERED: 'Đã nhận', READ: 'Đã xem' };
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly content = viewChild<ElementRef<HTMLElement>>('historyContent');
  private previousScope = '';
  private previousLast = '';
  private focusedTarget = '';
  private nearBottom = true;
  private initialized = false;
  private measuredHeight = 0;
  private measuredClientHeight = 0;
  private anchor?: { id: string; top: number };

  /** DOM đã render mới đo scroll; ảnh tải muộn vẫn giữ cuối nếu người đọc đang ở cuối. */
  constructor() {
    afterRenderEffect(() => {
      const viewport = this.viewport()?.nativeElement;
      const messages = this.messages();
      const scope = this.scope();
      const target = this.target();
      const loadingOlder = this.loadingOlder();
      if (!viewport) return;
      if (scope !== this.previousScope) {
        this.previousScope = scope;
        this.initialized = false;
        this.measuredHeight = 0;
        this.measuredClientHeight = 0;
        this.nearBottom = true;
        this.previousLast = '';
        this.focusedTarget = '';
        this.anchor = undefined;
        this.newMessages.set(false);
      }
      const targetElement = target
        ? viewport.querySelector<HTMLElement>(`[id="message-${target}"]`)
        : null;
      if (targetElement && target !== this.focusedTarget) {
        viewport.scrollTop +=
          targetElement.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top -
          viewport.clientHeight / 2 +
          targetElement.offsetHeight / 2;
        this.focusedTarget = target;
        this.nearBottom = false;
        this.initialized = true;
      } else if (!this.initialized && messages.length) {
        viewport.scrollTop = viewport.scrollHeight;
        this.initialized = true;
      } else if (this.anchor && !loadingOlder) {
        const element = viewport.querySelector<HTMLElement>(`[id="${this.anchor.id}"]`);
        if (element) viewport.scrollTop += element.getBoundingClientRect().top - this.anchor.top;
        this.anchor = undefined;
      } else if (messages.at(-1)?.id !== this.previousLast && messages.length) {
        if (this.nearBottom) viewport.scrollTop = viewport.scrollHeight;
        else this.newMessages.set(true);
      }
      this.previousLast = messages.at(-1)?.id ?? '';
    });
    afterRenderEffect((onCleanup) => {
      const content = this.content()?.nativeElement;
      if (!content || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => {
        const viewport = this.viewport()?.nativeElement;
        if (viewport && this.nearBottom && !this.anchor) viewport.scrollTop = viewport.scrollHeight;
      });
      observer.observe(content);
      const viewport = this.viewport()?.nativeElement;
      if (viewport) observer.observe(viewport);
      onCleanup(() => observer.disconnect());
    });
    inject(DestroyRef).onDestroy(() => {
      this.anchor = undefined;
    });
  }

  /** Ghi vị trí một tin đang thấy trước khi prepend, không dùng chiều cao ước lượng. */
  loadOlder(): void {
    const viewport = this.viewport()?.nativeElement;
    if (!viewport || this.loadingOlder() || !this.hasOlder()) return;
    const top = viewport.getBoundingClientRect().top;
    const visible = [...viewport.querySelectorAll<HTMLElement>('.message')].find(
      (element) => element.getBoundingClientRect().bottom > top,
    );
    if (visible) this.anchor = { id: visible.id, top: visible.getBoundingClientRect().top };
    this.older.emit();
  }

  /** Chỉ tự cuộn khi ở gần cuối; kéo lên đầu tải trang cũ với nút dự phòng. */
  scroll(): void {
    const viewport = this.viewport()?.nativeElement;
    if (!viewport) return;
    const geometryChanged =
      this.measuredHeight !== viewport.scrollHeight ||
      this.measuredClientHeight !== viewport.clientHeight;
    this.measuredHeight = viewport.scrollHeight;
    this.measuredClientHeight = viewport.clientHeight;
    // Resize/ảnh tải muộn có thể tự phát scroll: giữ cuối nếu chưa có ý định đọc tin cũ.
    if (geometryChanged && this.nearBottom && !this.anchor) {
      viewport.scrollTop = viewport.scrollHeight;
      return;
    }
    this.nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96;
    if (this.nearBottom) this.newMessages.set(false);
    if (viewport.scrollTop < 24 && !this.nearBottom) this.loadOlder();
  }

  /** Người dùng chủ động trở về tin gần nhất thay vì bị kéo khỏi lịch sử đang đọc. */
  latest(): void {
    const viewport = this.viewport()?.nativeElement;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
    this.nearBottom = true;
    this.newMessages.set(false);
  }
}
