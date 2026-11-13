import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthApi } from '../data-access/auth.api';
import { SessionService } from '../../../core/auth/session.service';
import type { OtpProof } from '../../../core/http/api.models';
import { usernameValidator, phoneValidator } from '../../../shared/validation/account.validators';
import { ActionState } from '../../../shared/ui/action-state';
import { Feedback } from '../../../shared/ui/feedback';
import { OtpInput } from '../components/otp-input';

@Component({
  imports: [ReactiveFormsModule, RouterLink, Feedback, OtpInput],
  templateUrl: './login.page.html',
})
export class LoginPage {
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly deletionRequested = this.route.snapshot.queryParamMap.has('deletionRequested');
  readonly state = new ActionState();
  readonly mode = signal<'password' | 'phone'>('password');
  readonly proof = signal<OtpProof | null>(null);
  readonly form = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, usernameValidator],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(512)],
    }),
  });
  readonly phone = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, phoneValidator],
  });

  /** Trao đổi credential đã chọn và đưa tài khoản chờ xóa đến màn hình hủy. */
  async submit(): Promise<void> {
    if (this.mode() === 'password' ? this.form.invalid : this.phone.invalid || !this.proof()) {
      this.form.markAllAsTouched();
      this.phone.markAsTouched();
      return;
    }
    await this.state.run(async () => {
      const proof = this.proof();
      const payload =
        this.mode() === 'password'
          ? await this.api.login(
              this.form.controls.username.value,
              this.form.controls.password.value,
            )
          : proof && (await this.api.phoneLogin(this.phone.value, proof));
      const tokens = this.session.accept(payload);
      this.form.controls.password.reset();
      this.proof.set(null);
      const requested = this.route.snapshot.queryParamMap.get('returnUrl');
      const target =
        requested?.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/auth/')
          ? requested
          : '/account';
      await this.router.navigateByUrl(
        tokens.status === 'PENDING_DELETION' ? '/account/deletion' : target,
      );
    });
  }
}
