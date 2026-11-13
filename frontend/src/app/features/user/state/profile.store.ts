import { Injectable, effect, inject, signal } from '@angular/core';
import { UserApi } from '../data-access/user.api';
import type { PrivateProfile } from '../../../core/http/api.models';
import { SessionService } from '../../../core/auth/session.service';

@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly api = inject(UserApi);
  private readonly session = inject(SessionService);
  readonly profile = signal<PrivateProfile | null>(null);

  /** Xóa trường riêng đã cache khi quyền bị xóa, kể cả khôi phục cookie thất bại. */
  constructor() {
    effect(() => {
      if (!this.session.authenticated()) this.profile.set(null);
    });
  }

  /** Lấy dữ liệu chủ hiện tại trên mỗi trang bảo vệ thay vì giữ cache người dùng khác. */
  async load(): Promise<PrivateProfile> {
    return this.retainResponse(() => this.api.me());
  }

  /** Chỉ áp dụng đọc và thay đổi khi lượt đăng nhập ban đầu vẫn sở hữu cache. */
  async retainResponse(request: () => Promise<PrivateProfile>): Promise<PrivateProfile> {
    const identityVersion = this.session.identityVersion();
    const profile = await request();
    if (identityVersion !== this.session.identityVersion() || !this.session.authenticated())
      throw new Error('Phiên đã thay đổi.');
    this.profile.set(profile);
    return profile;
  }
}
