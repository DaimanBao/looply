import { Component, OnDestroy, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import type { OtpProof, OtpPurpose } from '../../../core/http/api.models';
import { AuthApi } from '../data-access/auth.api';
import { ActionState } from '../../../shared/ui/action-state';
import { Feedback } from '../../../shared/ui/feedback';
import { otpValidator } from '../../../shared/validation/account.validators';

@Component({
  selector: 'app-otp-input',
  imports: [ReactiveFormsModule, Feedback],
  template: `
    <div class="otp-panel">
      <button
        type="button"
        class="secondary"
        (click)="request()"
        [disabled]="state.busy() || remaining() > 0 || !destination()"
      >
        {{ remaining() > 0 ? 'Gửi lại sau ' + remaining() + ' giây' : 'Gửi mã xác minh' }}
      </button>
      <app-feedback [state]="state" />
      @if (challenge()) {
        <label
          >Mã xác minh (6 số)<input
            [formControl]="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            (input)="publish()"
        /></label>
        <small>Mã có hiệu lực 5 phút. Nhập mã được gửi đến {{ destination() }}.</small>
      }
    </div>
  `,
})
export class OtpInput implements OnDestroy {
  private readonly api = inject(AuthApi);
  readonly purpose = input.required<OtpPurpose>();
  readonly destination = input.required<string>();
  readonly proof = output<OtpProof | null>();
  readonly state = new ActionState();
  readonly remaining = signal(0);
  readonly challenge = signal('');
  readonly code = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, otpValidator],
  });
  private timer?: ReturnType<typeof setInterval>;
  private requestedDestination = '';
  /** Requests real metadata; destination changes invalidate the emitted proof. */
  async request(): Promise<void> {
    this.proof.emit(null);
    await this.state.run(async () => {
      const destination = this.destination();
      const result = await this.api.requestOtp(this.purpose(), destination);
      if (destination !== this.destination()) return;
      this.requestedDestination = destination;
      this.challenge.set(result.challengeId);
      this.code.reset();
      this.remaining.set(60);
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.remaining.update((value) => Math.max(0, value - 1));
        if (!this.remaining()) clearInterval(this.timer);
      }, 1000);
    }, 'Nếu thông tin đủ điều kiện, mã xác minh đã được gửi.');
  }
  /** Emits a complete proof only for the contact that received this challenge. */
  publish(): void {
    this.proof.emit(
      this.code.valid && this.requestedDestination === this.destination()
        ? { challengeId: this.challenge(), code: this.code.value }
        : null,
    );
  }
  /** Stops the cooldown ticker when leaving the form. */
  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
