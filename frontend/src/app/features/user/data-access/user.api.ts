import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../../../core/http/api.config';
import type {
  AuthSession,
  ContactChange,
  PrivateProfile,
  ProfilePage,
  ProfilePatch,
  Province,
  PublicProfile,
} from '../../../core/http/api.models';

@Injectable({ providedIn: 'root' })
export class UserApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE);

  /** Nạp danh mục hoạt động do server quản lý, không tạo danh sách local trùng. */
  provinces(): Promise<Province[]> {
    return firstValueFrom(this.http.get<Province[]>(`${this.base}/provinces`));
  }

  /** Chỉ lấy trường riêng từ endpoint chủ sở hữu hiện tại. */
  me(): Promise<PrivateProfile> {
    return firstValueFrom(this.http.get<PrivateProfile>(`${this.base}/users/me`));
  }

  /** Đọc projection công khai có xét block. */
  profile(id: string): Promise<PublicProfile> {
    return firstValueFrom(
      this.http.get<PublicProfile>(`${this.base}/users/${encodeURIComponent(id)}`),
    );
  }

  /** Chỉ gửi trường hồ sơ được sửa, để Auth quản lý sở hữu liên hệ. */
  update(patch: ProfilePatch): Promise<PrivateProfile> {
    return firstValueFrom(this.http.patch<PrivateProfile>(`${this.base}/users/me`, patch));
  }

  /** Để server thực thi duy nhất và thời gian chờ 30 ngày nguyên tử. */
  username(username: string): Promise<PrivateProfile> {
    return firstValueFrom(
      this.http.patch<PrivateProfile>(`${this.base}/users/me/username`, {
        username: username.toLowerCase(),
      }),
    );
  }

  /** Commit liên hệ mới xác minh với proof thao tác dùng một lần. */
  contact(kind: 'email' | 'phone', input: ContactChange): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`${this.base}/users/me/${kind}`, input));
  }

  /** Đổi mật khẩu trong khi server thu hồi thiết bị khác. */
  password(password: string, reauthProof: string): Promise<void> {
    return firstValueFrom(
      this.http.patch<void>(`${this.base}/users/me/password`, { password, reauthProof }),
    );
  }

  /** Trả metadata an toàn cho phiên của chính bên gọi. */
  sessions(): Promise<AuthSession[]> {
    return firstValueFrom(this.http.get<AuthSession[]>(`${this.base}/auth/sessions`));
  }

  /** Thu hồi đúng phiên bên gọi chọn. */
  revoke(id: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/auth/sessions/${encodeURIComponent(id)}`),
    );
  }

  /** Gửi byte thô thay vì multipart hoặc storage key. */
  avatar(file: File): Promise<PrivateProfile> {
    return firstValueFrom(
      this.http.put<PrivateProfile>(`${this.base}/users/me/avatar`, file, {
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    );
  }

  /** Chỉ xóa con trỏ avatar của chủ sở hữu. */
  removeAvatar(): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/users/me/avatar`));
  }

  /** Lấy byte ảnh riêng/có xét block qua hệ thống HTTP có xác thực. */
  avatarImage(id: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.base}/users/${encodeURIComponent(id)}/avatar`, {
        responseType: 'blob',
      }),
    );
  }

  /** Dùng nguyên cursor server, không suy phân trang từ hàng hiển thị. */
  related(
    id: string,
    kind: 'followers' | 'following' | 'blocked',
    after?: string,
  ): Promise<ProfilePage> {
    const path = kind === 'blocked' ? 'me/blocked' : `${encodeURIComponent(id)}/${kind}`;
    let params = new HttpParams().set('limit', 20);
    if (after) params = params.set('after', after);
    return firstValueFrom(this.http.get<ProfilePage>(`${this.base}/users/${path}`, { params }));
  }

  /** Gọi endpoint quan hệ idempotent; server quản lý cleanup khi chặn. */
  relationship(id: string, kind: 'follow' | 'block', enabled: boolean): Promise<void> {
    const url = `${this.base}/users/${encodeURIComponent(id)}/${kind}`;
    return firstValueFrom(enabled ? this.http.put<void>(url, {}) : this.http.delete<void>(url));
  }

  /** Bắt đầu thời gian chờ do server quản lý; endpoint thu hồi mọi phiên. */
  requestDeletion(reauthProof: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(
        `${this.base}/users/me/deletion`,
        { reauthProof },
        { withCredentials: true },
      ),
    );
  }

  /** Hủy tường minh yêu cầu đang chờ; không tự chạy khi đăng nhập. */
  cancelDeletion(): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/users/me/deletion`));
  }
}
