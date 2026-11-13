import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserApi } from '../data-access/user.api';
import { ProfileStore } from '../state/profile.store';
import { usernameValidator } from '../../../shared/validation/account.validators';
import { ActionState } from '../../../shared/ui/action-state';
import { Feedback } from '../../../shared/ui/feedback';

@Component({
  imports: [ReactiveFormsModule, RouterLink, Feedback, DatePipe],
  templateUrl: './username.page.html',
})
export class UsernamePage implements OnInit {
  private readonly api = inject(UserApi);
  private readonly store = inject(ProfileStore);
  readonly state = new ActionState();
  readonly username = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, usernameValidator],
  });
  readonly nextChange = computed(() => {
    const changed = this.store.profile()?.usernameChangedAt;
    return changed ? new Date(Date.parse(changed) + 30 * 86400000) : null;
  });

  /** Hiển thị timestamp lần đổi cuối có thẩm quyền. */
  ngOnInit(): void {
    void this.state.run(async () => {
      this.username.setValue((await this.store.load()).username);
    });
  }

  /** Dùng thời gian chờ server thay vì tin đồng hồ trình duyệt. */
  async submit(): Promise<void> {
    if (this.username.invalid) {
      this.username.markAsTouched();
      this.state.error.set('Tên đăng nhập cần 3–30 chữ cái, chữ số hoặc dấu gạch dưới.');
      return;
    }
    await this.state.run(async () => {
      await this.store.retainResponse(() => this.api.username(this.username.value));
    }, 'Đã đổi tên đăng nhập.');
  }
}
