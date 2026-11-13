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
  templateUrl: './otp-input.html',
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

  /** Yêu cầu metadata thật; đổi đích sẽ vô hiệu hóa proof đã phát. */
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

  /** Chỉ phát proof đầy đủ cho liên hệ đã nhận challenge này. */
  publish(): void {
    this.proof.emit(
      this.code.valid && this.requestedDestination === this.destination()
        ? { challengeId: this.challenge(), code: this.code.value }
        : null,
    );
  }

  /** Dừng bộ đếm thời gian chờ khi rời form. */
  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
