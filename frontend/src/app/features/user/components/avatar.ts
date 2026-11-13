import { Component, OnDestroy, effect, inject, input, signal, untracked } from '@angular/core';
import type { PublicProfile } from '../../../core/http/api.models';
import { UserApi } from '../data-access/user.api';

@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.html',
})
export class Avatar implements OnDestroy {
  private readonly api = inject(UserApi);
  readonly profile = input.required<PublicProfile>();
  readonly image = signal('');
  private revision = 0;

  /** Nạp byte ảnh được bảo vệ, bỏ response đến muộn sau điều hướng hoặc đổi hồ sơ. */
  constructor() {
    effect(() => {
      const profile = this.profile();
      const revision = ++this.revision;
      untracked(() => this.release());
      if (profile.avatarUrl)
        void this.api
          .avatarImage(profile.id)
          .then((blob) => {
            if (revision === this.revision) this.image.set(URL.createObjectURL(blob));
          })
          .catch(() => {
            /* Missing/hidden images render initials, never a stale previous avatar. */
          });
    });
  }

  /** Giải phóng byte do trình duyệt quản lý ngay khi không còn hiển thị. */
  private release(): void {
    if (this.image()) URL.revokeObjectURL(this.image());
    this.image.set('');
  }

  /** Vô hiệu hóa yêu cầu đang chờ và giải phóng object URL hiện tại. */
  ngOnDestroy(): void {
    this.revision++;
    this.release();
  }
}
