import { Component, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { OtpProof, SensitiveOperation } from '../../../core/http/api.models';
import { AuthApi } from '../data-access/auth.api';
import { OtpInput } from './otp-input';

@Component({
  selector: 'app-reauth-input',
  imports: [ReactiveFormsModule, OtpInput],
  templateUrl: './reauth-input.html',
})
export class ReauthInput {
  private readonly api = inject(AuthApi);
  readonly operation = input.required<SensitiveOperation>();
  readonly phone = input('');
  readonly method = signal<'password' | 'phone'>('password');
  readonly proof = signal<OtpProof | null>(null);
  readonly password = new FormControl('', { nonNullable: true });

  /** Lấy proof mới lúc gửi; không lưu proof tái sử dụng trong UI. */
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
