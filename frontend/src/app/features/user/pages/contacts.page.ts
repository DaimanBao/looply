import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { OtpProof, SensitiveOperation } from '../../../core/http/api.models';
import { OtpInput } from '../../auth/public-api';
import { ReauthInput } from '../../auth/public-api';
import { phoneValidator } from '../../../shared/validation/account.validators';
import { ActionState } from '../../../shared/ui/action-state';
import { Feedback } from '../../../shared/ui/feedback';
import { UserApi } from '../data-access/user.api';
import { ProfileStore } from '../state/profile.store';

@Component({
  imports: [ReactiveFormsModule, RouterLink, OtpInput, ReauthInput, Feedback],
  template: `
    <p><a routerLink="/account">← Tài khoản</a></p>
    <section class="card form-card">
      <h1>Thông tin liên hệ</h1>
      <p class="muted">Chỉ thay thế sau khi xác thực lại và xác minh mã gửi đến thông tin mới.</p>
      <div class="tabs">
        <button type="button" [attr.aria-pressed]="kind() === 'email'" (click)="choose('email')">
          Email</button
        ><button type="button" [attr.aria-pressed]="kind() === 'phone'" (click)="choose('phone')">
          Số điện thoại
        </button>
      </div>
      @if (store.profile(); as profile) {
        <p>
          Hiện tại:
          {{
            kind() === 'email'
              ? profile.email || 'Chưa thêm email'
              : profile.phone || 'Chưa thêm số điện thoại'
          }}
        </p>
        <form (submit)="$event.preventDefault(); submit()">
          <label
            >{{ kind() === 'email' ? 'Email mới / email cần xác minh' : 'Số điện thoại mới'
            }}<input
              [type]="kind() === 'email' ? 'email' : 'tel'"
              [formControl]="destination"
              (input)="proof.set(null)"
              maxlength="254"
          /></label>
          <app-otp-input
            [purpose]="kind() === 'email' ? 'VERIFY_EMAIL' : 'CHANGE_PHONE'"
            [destination]="destination.valid ? destination.value : ''"
            (proof)="proof.set($event)"
          />
          <app-reauth-input
            [operation]="operation()"
            [phone]="profile.phoneVerifiedAt ? profile.phone || '' : ''"
          />
          <button class="primary" [disabled]="state.busy()">Xác minh & lưu</button>
        </form>
      }
      <app-feedback [state]="state" />
    </section>
  `,
})
export class ContactsPage implements OnInit {
  private readonly api = inject(UserApi);
  readonly store = inject(ProfileStore);
  private readonly reauth = viewChild(ReauthInput);
  readonly kind = signal<'email' | 'phone'>('email');
  readonly proof = signal<OtpProof | null>(null);
  readonly state = new ActionState();
  readonly operation = computed<SensitiveOperation>(() =>
    this.kind() === 'email' ? 'CHANGE_EMAIL' : 'CHANGE_PHONE',
  );
  readonly destination = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.email, Validators.maxLength(254)],
  });
  /** Reloads owner contact verification metadata. */
  ngOnInit(): void {
    this.store.profile.set(null);
    void this.state.run(async () => {
      await this.store.load();
    });
  }
  /** Resets destination-bound proof when switching contact types. */
  choose(kind: 'email' | 'phone'): void {
    if (this.state.busy()) return;
    this.kind.set(kind);
    this.proof.set(null);
    this.destination.reset();
    this.destination.setValidators([
      Validators.required,
      kind === 'email' ? Validators.email : phoneValidator,
      Validators.maxLength(254),
    ]);
    this.destination.updateValueAndValidity();
  }
  /** Acquires a one-use operation proof immediately before committing the new verified contact. */
  async submit(): Promise<void> {
    const proof = this.proof();
    const reauth = this.reauth();
    if (this.destination.invalid || !proof || !reauth) {
      this.state.error.set('Nhập thông tin mới hợp lệ, mã OTP và phương thức xác thực lại.');
      return;
    }
    const kind = this.kind();
    const destination = this.destination.value;
    await this.state.run(async () => {
      const reauthProof = await reauth.authorize();
      await this.api.contact(kind, { destination, ...proof, reauthProof });
      this.proof.set(null);
      this.destination.reset();
      await this.store.load();
    }, 'Đã xác minh và cập nhật thông tin liên hệ.');
  }
}
