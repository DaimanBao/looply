import { Component, input } from '@angular/core';
import { ActionState } from './action-state';

@Component({
  selector: 'app-feedback',
  template: `
    @if (state().busy()) {
      <p role="status">Đang xử lý…</p>
    }
    @if (state().error()) {
      <p class="notice error" role="alert">{{ state().error() }}</p>
    }
    @if (state().message()) {
      <p class="notice success" role="status">{{ state().message() }}</p>
    }
  `,
})
export class Feedback {
  readonly state = input.required<ActionState>();
}
