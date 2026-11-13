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
  template: `
    <p><a routerLink="/account">← Tài khoản</a></p>
    <section class="card form-card">
      <h1>Đổi tên đăng nhập</h1>
      <p class="muted">Sau mỗi lần đổi thành công, bạn cần chờ đủ 30 ngày để đổi tiếp.</p>
      @if (nextChange(); as date) {
        <p class="notice">
          Lần đổi tiếp theo từ {{ date | date: 'dd/MM/yyyy HH:mm' }}. Máy chủ sẽ kiểm tra thời hạn
          chính xác.
        </p>
      }
      <form (submit)="$event.preventDefault(); submit()">
        <label>Tên đăng nhập mới<input [formControl]="username" autocomplete="username" /></label
        ><small>3–30 chữ cái, chữ số hoặc dấu gạch dưới.</small
        ><app-feedback [state]="state" /><button class="primary" [disabled]="state.busy()">
          Lưu tên đăng nhập
        </button>
      </form>
    </section>
  `,
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
  /** Shows the authoritative last-change timestamp. */
  ngOnInit(): void {
    void this.state.run(async () => {
      this.username.setValue((await this.store.load()).username);
    });
  }
  /** Uses the server cooldown rather than trusting the browser clock. */
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
