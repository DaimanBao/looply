import { Component, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { OtpProof, SensitiveOperation } from '../../../core/http/api.models';
import { AuthApi } from '../data-access/auth.api';
import { OtpInput } from './otp-input';

@Component({
  selector: 'app-reauth-input',
  imports: [ReactiveFormsModule, OtpInput],
  template: `
    <fieldset>
      <legend>Xác thực lại để bảo vệ tài khoản</legend>
      <div class="tabs">
        <button
          type="button"
          [attr.aria-pressed]="method() === 'password'"
          (click)="method.set('password')"
        >
          Mật khẩu hiện tại
        </button>
        @if (phone()) {
          <button
            type="button"
            [attr.aria-pressed]="method() === 'phone'"
            (click)="method.set('phone')"
          >
            OTP số đã xác minh
          </button>
        }
      </div>
      @if (method() === 'password') {
        <label
          >Mật khẩu hiện tại<input
            type="password"
            autocomplete="current-password"
            [formControl]="password"
            maxlength="512"
        /></label>
      } @else {
        <app-otp-input purpose="REAUTH_PHONE" [destination]="phone()" (proof)="proof.set($event)" />
      }
    </fieldset>
  `,
})
export class ReauthInput {
  private readonly api = inject(AuthApi);
  readonly operation = input.required<SensitiveOperation>();
  readonly phone = input('');
  readonly method = signal<'password' | 'phone'>('password');
  readonly proof = signal<OtpProof | null>(null);
  readonly password = new FormControl('', { nonNullable: true });
  /** Acquires a fresh proof at submission time; no reusable proof is persisted in the UI. */
  async authorize(): Promise<string> {
    const proof = this.proof();
    const method = this.method() === 'password' ? { password: this.password.value } : proof;
    if (!method) throw new Error('Cần xác minh lại.');
    try {
      return (await this.api.reauthenticate(this.operation(), method)).reauthProof;
    } finally {
      this.password.reset();
      this.proof.set(null);
    }
  }
}
