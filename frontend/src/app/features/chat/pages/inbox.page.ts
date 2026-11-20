import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InboxState } from '../state/inbox.state';
import { ChatRealtime } from '../state/chat-realtime';

@Component({
  selector: 'app-inbox',
  imports: [RouterLink, DatePipe],
  templateUrl: './inbox.page.html',
  styleUrl: './inbox.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InboxPage {
  readonly state = inject(InboxState);
  readonly realtime = inject(ChatRealtime);
  readonly selectedId = input('');

  /** Avatar chữ cái dùng đúng display name; API Inbox chưa có ảnh đại diện. */
  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((part) => [...part][0] ?? '')
      .join('')
      .toLocaleUpperCase('vi');
  }

  /** Chỉ lọc dữ liệu đã tải, không giả lập search endpoint toàn bộ Inbox. */
  search(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.state.search.set(event.target.value);
  }
}
