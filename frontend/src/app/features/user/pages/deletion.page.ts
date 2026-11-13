import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { ReauthInput } from '../../auth/public-api';
import { ActionState } from '../../../shared/ui/action-state';
import { Feedback } from '../../../shared/ui/feedback';
import { UserApi } from '../data-access/user.api';
import { ProfileStore } from '../state/profile.store';

@Component({
  imports: [RouterLink, ReactiveFormsModule, ReauthInput, Feedback, DatePipe],
  templateUrl: './deletion.page.html',
})
export class DeletionPage implements OnInit {
  private readonly api = inject(UserApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly reauth = viewChild(ReauthInput);
  readonly store = inject(ProfileStore);
  readonly state = new ActionState();
  readonly confirmRequest = new FormControl(false, {
    nonNullable: true,
    validators: [Validators.requiredTrue],
  });
  readonly confirmCancel = new FormControl(false, {
    nonNullable: true,
    validators: [Validators.requiredTrue],
  });

  /** Đọc thông tin vòng đời mà không bật tương tác thường của tài khoản chờ xóa. */
  ngOnInit(): void {
    this.store.profile.set(null);
    void this.state.run(async () => {
      await this.store.load();
    });
  }

  /** Chỉ bắt đầu xóa sau xác nhận tường minh và xác thực lại mới trên server. */
  async request(): Promise<void> {
    const reauth = this.reauth();
    if (!this.confirmRequest.value || !reauth) return;
    await this.state.run(async () => {
      await this.api.requestDeletion(await reauth.authorize());
      this.session.clear();
      this.store.profile.set(null);
      await this.router.navigate(['/auth/login'], { queryParams: { deletionRequested: '1' } });
    });
  }

  /** Hủy tường minh là thao tác duy nhất đưa tài khoản chờ xóa trở lại hoạt động. */
  async cancel(): Promise<void> {
    if (!this.confirmCancel.value) return;
    await this.state.run(async () => {
      await this.api.cancelDeletion();
      await firstValueFrom(this.session.refresh());
      await this.store.load();
      await this.router.navigateByUrl('/account');
    }, 'Đã hủy yêu cầu xóa.');
  }
}
