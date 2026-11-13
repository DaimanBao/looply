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
  templateUrl: './password.page.html',
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

  /** Lấy điện thoại đã xác minh có thể dùng để xác thực lại tùy chọn qua OTP. */
  ngOnInit(): void {
    this.store.profile.set(null);
    void this.state.run(async () => {
      await this.store.load();
    });
  }

  /** Không lưu proof tái sử dụng hoặc mật khẩu bản rõ sau thao tác thành công. */
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
