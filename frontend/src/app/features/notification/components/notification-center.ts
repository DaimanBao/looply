import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotificationState } from '../state/notification.state';

@Component({
  selector: 'app-notification-center',
  imports: [RouterLink],
  templateUrl: './notification-center.html',
  styleUrl: './notification-center.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationCenter {
  readonly state = inject(NotificationState);
}
