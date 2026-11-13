import { Component, input } from '@angular/core';
import { ActionState } from './action-state';

@Component({
  selector: 'app-feedback',
  templateUrl: './feedback.html',
})
export class Feedback {
  readonly state = input.required<ActionState>();
}
