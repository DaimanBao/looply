import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NotificationState } from '../state/notification.state';
import { notificationLabels, type NotificationItem } from '../models/notification.models';

@Component({
  selector: 'app-notifications',
  imports: [DatePipe],
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPage {
  readonly state = inject(NotificationState);
  readonly labels = notificationLabels;
  readonly deleting = signal<NotificationItem | null>(null);

  /** Chỉ xóa khi người dùng xác nhận trong trang, không dùng dialog chặn trình duyệt. */
  async confirmDelete(): Promise<void> {
    const item = this.deleting();
    if (!item) return;
    await this.state.remove(item);
    this.deleting.set(null);
  }
}
