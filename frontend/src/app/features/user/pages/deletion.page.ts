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
  template: `
    <section class="card form-card">
      <span class="eyebrow">QUYỀN KIỂM SOÁT CỦA BẠN</span>
      <h1>Xóa tài khoản</h1>
      <app-feedback [state]="state" />
      @if (store.profile(); as profile) {
        @if (profile.status === 'PENDING_DELETION') {
          <div class="notice warning">
            <h2>Tài khoản đang chờ xóa</h2>
            <p>
              Đã yêu cầu lúc {{ profile.deletionRequestedAt | date: 'dd/MM/yyyy HH:mm' }}. Thời gian
              chờ là 30 ngày.
            </p>
            <p>
              Hồ sơ và bài đăng được ẩn; các tương tác thông thường bị tạm ngừng. Đăng nhập không tự
              hủy yêu cầu xóa.
            </p>
          </div>
          <label class="check-label"
            ><input type="checkbox" [formControl]="confirmCancel" /> Tôi muốn hủy yêu cầu xóa và sử
            dụng lại tài khoản.</label
          >
          <button
            class="primary"
            (click)="cancel()"
            [disabled]="state.busy() || !confirmCancel.value"
          >
            Xác nhận hủy yêu cầu xóa
          </button>
        } @else if (profile.status === 'ACTIVE') {
          <p>
            Bạn có 30 ngày chờ sau khi yêu cầu xóa. Trong thời gian này, hãy đăng nhập và hủy yêu
            cầu một cách tường minh nếu đổi ý.
          </p>
          <p>
            Sau khi quá trình xóa bắt đầu, tài khoản không thể khôi phục. Lịch sử hội thoại và tệp
            Chat thông thường được giữ cho người tham gia còn lại; người gửi được ẩn danh.
          </p>
          <form (submit)="$event.preventDefault(); request()">
            <app-reauth-input
              operation="DELETE_ACCOUNT"
              [phone]="profile.phoneVerifiedAt ? profile.phone || '' : ''"
            /><label class="check-label"
              ><input type="checkbox" [formControl]="confirmRequest" /> Tôi hiểu và muốn yêu cầu xóa
              tài khoản.</label
            ><button class="danger" [disabled]="state.busy() || !confirmRequest.value">
              Yêu cầu xóa tài khoản
            </button>
          </form>
          <p><a routerLink="/account">Quay lại tài khoản</a></p>
        } @else {
          <p class="notice">Tài khoản đã ngừng hoạt động và không thể khôi phục.</p>
        }
      }
    </section>
  `,
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
  /** Reads lifecycle information without enabling ordinary pending-account interactions. */
  ngOnInit(): void {
    this.store.profile.set(null);
    void this.state.run(async () => {
      await this.store.load();
    });
  }
  /** Starts deletion only after explicit confirmation plus fresh server re-authentication. */
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
  /** Explicit cancellation is the only action that returns a pending account to active use. */
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
