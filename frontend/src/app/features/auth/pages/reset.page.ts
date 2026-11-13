import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { OtpProof } from '../../../core/http/api.models';
import { SessionService } from '../../../core/auth/session.service';
import { AuthApi } from '../data-access/auth.api';
import { OtpInput } from '../components/otp-input';
import { codePointLength } from '../../../shared/validation/account.validators';
import { ActionState } from '../../../shared/ui/action-state';
import { Feedback } from '../../../shared/ui/feedback';

@Component({
  imports: [ReactiveFormsModule, RouterLink, OtpInput, Feedback],
  templateUrl: './reset.page.html',
})
export class ResetPage {
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionService);
  readonly state = new ActionState();
  readonly proof = signal<OtpProof | null>(null);
  readonly form = new FormGroup({
    destination: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(254)],
    }),
    password: new FormControl('', { nonNullable: true, validators: [codePointLength(8, 128)] }),
  });

  /** Dùng challenge liên hệ đã xác minh và xóa quyền client cũ sau khôi phục. */
  async submit(): Promise<void> {
    const proof = this.proof();
    if (this.form.invalid || !proof) {
      this.form.markAllAsTouched();
      this.state.error.set('Nhập thông tin hợp lệ và mã xác minh.');
      return;
    }
    await this.state.run(async () => {
      const value = this.form.getRawValue();
      await this.api.reset(value.destination, value.password, proof);
      this.session.clear();
      this.form.reset();
      this.proof.set(null);
    }, 'Đã đổi mật khẩu. Bạn có thể đăng nhập lại.');
  }
}
