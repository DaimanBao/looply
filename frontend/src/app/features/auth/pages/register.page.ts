import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { OtpProof, Province } from '../../../core/http/api.models';
import { SessionService } from '../../../core/auth/session.service';
import { UserApi } from '../../user/public-api';
import { AuthApi } from '../data-access/auth.api';
import { OtpInput } from '../components/otp-input';
import {
  codePointLength,
  phoneValidator,
  usernameValidator,
} from '../../../shared/validation/account.validators';
import { ActionState } from '../../../shared/ui/action-state';
import { Feedback } from '../../../shared/ui/feedback';

@Component({
  imports: [ReactiveFormsModule, RouterLink, OtpInput, Feedback],
  templateUrl: './register.page.html',
})
export class RegisterPage implements OnInit {
  private readonly api = inject(AuthApi);
  private readonly users = inject(UserApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly state = new ActionState();
  readonly catalogState = new ActionState();
  readonly provinces = signal<Province[]>([]);
  readonly proof = signal<OtpProof | null>(null);
  readonly form = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, usernameValidator],
    }),
    password: new FormControl('', { nonNullable: true, validators: [codePointLength(8, 128)] }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, phoneValidator],
    }),
    provinceCode: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(254)],
    }),
  });
  /** Loads live catalog data before accepting registration. */
  ngOnInit(): void {
    void this.loadProvinces();
  }
  /** Makes catalog failures recoverable without losing the form. */
  async loadProvinces(): Promise<void> {
    await this.catalogState.run(async () => {
      this.provinces.set(await this.users.provinces());
    });
  }
  /** Registration uses a delivered SMS proof and immediately adopts the server-issued session. */
  async submit(): Promise<void> {
    const proof = this.proof();
    if (this.form.invalid || !proof) {
      this.form.markAllAsTouched();
      this.state.error.set('Kiểm tra thông tin và nhập mã xác minh hợp lệ.');
      return;
    }
    await this.state.run(async () => {
      const value = this.form.getRawValue();
      this.session.accept(
        await this.api.register({
          username: value.username,
          password: value.password,
          phone: value.phone,
          provinceCode: value.provinceCode,
          ...proof,
          ...(value.email ? { email: value.email.trim().toLowerCase() } : {}),
        }),
      );
      this.form.controls.password.reset();
      this.proof.set(null);
      await this.router.navigateByUrl('/account');
    });
  }
}
