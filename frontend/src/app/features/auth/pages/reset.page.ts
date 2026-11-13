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
  template: `
    <section class="card form-card">
      <span class="eyebrow">LẤY LẠI QUYỀN TRUY CẬP</span>
      <h1>Khôi phục mật khẩu</h1>
      <p class="muted">
        Sử dụng email hoặc số điện thoại đã xác minh. Thành công sẽ đăng xuất tất cả thiết bị.
      </p>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <label
          >Email hoặc số điện thoại<input
            formControlName="destination"
            autocomplete="username"
            (input)="proof.set(null)" /></label
        ><small>Số điện thoại dùng định dạng +84…</small>
        <app-otp-input
          purpose="RESET_PASSWORD"
          [destination]="form.controls.destination.valid ? form.controls.destination.value : ''"
          (proof)="proof.set($event)"
        />
        <label
          >Mật khẩu mới<input
            type="password"
            formControlName="password"
            autocomplete="new-password" /></label
        ><small>8–128 ký tự Unicode.</small> <app-feedback [state]="state" /><button
          class="primary"
          [disabled]="state.busy()"
        >
          Đặt mật khẩu mới
        </button>
      </form>
      <p><a routerLink="/auth/login">Quay lại đăng nhập</a></p>
    </section>
  `,
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
  /** Uses a verified contact challenge and clears obsolete client authority after recovery. */
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
