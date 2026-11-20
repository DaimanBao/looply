import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  templateUrl: './contacts.page.html',
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

  /** Mở đúng loại liên hệ từ lời nhắc, giữ luồng OTP và re-auth hiện có. */
  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const kind = params.get('kind');
        if (kind === 'phone' || kind === 'email') this.choose(kind);
      });
  }

  /** Nạp lại metadata xác minh liên hệ của chủ sở hữu. */
  ngOnInit(): void {
    this.store.profile.set(null);
    void this.state.run(async () => {
      await this.store.load();
    });
  }

  /** Đặt lại proof gắn đích khi chuyển loại liên hệ. */
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

  /** Lấy proof thao tác dùng một lần ngay trước khi commit liên hệ mới đã xác minh. */
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
