import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReminderState } from '../state/reminder.state';
import { reminderActions } from '../models/reminder.models';

@Component({
  selector: 'app-reminder-card',
  imports: [RouterLink],
  templateUrl: './reminder-card.html',
  styleUrl: './reminder-card.scss',
})
export class ReminderCard {
  readonly state = inject(ReminderState);
  readonly actions = reminderActions;
}
