import { Component, OnInit, inject, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ReauthInput } from '../../auth/public-api';
import { codePointLength } from '../../../shared/validation/account.validators';
import { ActionState } from '../../../shared/ui/action-state';
import { Feedback } from '../../../shared/ui/feedback';
import { UserApi } from '../data-access/user.api';
import { ProfileStore } from '../state/profile.store';

@Component({
  imports: [ReactiveFormsModule, RouterLink, ReauthInput, Feedback],
  template: `
    <p><a routerLink="/account">← Tài khoản</a></p>
    <section class="card form-card">
      <h1>Đổi mật khẩu</h1>
      <p class="muted">Đổi thành công sẽ thu hồi các phiên khác. Phiên hiện tại được giữ lại.</p>
      @if (store.profile(); as profile) {
        <form (submit)="$event.preventDefault(); submit()">
          <label
            >Mật khẩu mới<input
              type="password"
              [formControl]="password"
              autocomplete="new-password" /></label
          ><small>8–128 ký tự Unicode. Mật khẩu phổ biến hoặc đã bị lộ sẽ bị từ chối.</small
          ><app-reauth-input
            operation="CHANGE_PASSWORD"
            [phone]="profile.phoneVerifiedAt ? profile.phone || '' : ''"
          /><button class="primary" [disabled]="state.busy()">Đổi mật khẩu</button>
        </form>
      }
      <app-feedback [state]="state" />
    </section>
  `,
})
export class PasswordPage implements OnInit {
  private readonly api = inject(UserApi);
  readonly store = inject(ProfileStore);
  private readonly reauth = viewChild(ReauthInput);
  readonly state = new ActionState();
  readonly password = new FormControl('', {
    nonNullable: true,
    validators: [codePointLength(8, 128)],
  });
  /** Fetches the verified phone available for optional OTP re-authentication. */
  ngOnInit(): void {
    this.store.profile.set(null);
    void this.state.run(async () => {
      await this.store.load();
    });
  }
  /** Never stores a reusable proof or a plaintext password after a successful operation. */
  async submit(): Promise<void> {
    const reauth = this.reauth();
    if (this.password.invalid || !reauth) {
      this.state.error.set('Mật khẩu mới phải dài 8–128 ký tự Unicode.');
      return;
    }
    await this.state.run(async () => {
      await this.api.password(this.password.value, await reauth.authorize());
      this.password.reset();
    }, 'Đã đổi mật khẩu và đăng xuất các thiết bị khác.');
  }
}
