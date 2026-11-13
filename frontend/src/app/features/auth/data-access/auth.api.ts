import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../../../core/http/api.config';
import { ANONYMOUS } from '../../../core/auth/auth.interceptor';
import type {
  OtpAccepted,
  OtpPurpose,
  Registration,
  SensitiveOperation,
  OtpProof,
} from '../../../core/http/api.models';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE)}/auth`;

  /** Trao đổi credential công khai chủ động bỏ danh tính bearer trước đó. */
  login(username: string, password: string): Promise<unknown> {
    return firstValueFrom(
      this.http.post<unknown>(
        `${this.base}/login/password`,
        { username: username.toLowerCase(), password },
        this.publicOptions(),
      ),
    );
  }

  /** Gửi challenge đã chuyển dùng một lần đến endpoint đăng nhập điện thoại thật. */
  phoneLogin(phone: string, proof: OtpProof): Promise<unknown> {
    return firstValueFrom(
      this.http.post<unknown>(
        `${this.base}/login/phone`,
        { phone, ...proof },
        this.publicOptions(),
      ),
    );
  }

  /** Gửi dữ liệu đăng ký đã xác minh và để server thiết lập cookie. */
  register(input: Registration): Promise<unknown> {
    return firstValueFrom(
      this.http.post<unknown>(
        `${this.base}/register`,
        { ...input, username: input.username.toLowerCase() },
        this.publicOptions(),
      ),
    );
  }

  /** Mục đích OTP được bảo vệ giữ bearer hiện tại; mã không xuất hiện trong response. */
  requestOtp(purpose: OtpPurpose, destination: string): Promise<OtpAccepted> {
    const protectedPurpose = ['CHANGE_PHONE', 'VERIFY_EMAIL', 'REAUTH_PHONE'].includes(purpose);
    return firstValueFrom(
      this.http.post<OtpAccepted>(
        `${this.base}/otp/request`,
        { purpose, destination },
        protectedPurpose ? {} : this.publicOptions(),
      ),
    );
  }

  /** Đặt lại credential của liên hệ đã xác minh; mọi phiên server bị thu hồi. */
  reset(destination: string, password: string, proof: OtpProof): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(
        `${this.base}/password/reset`,
        { destination, password, ...proof },
        this.publicOptions(),
      ),
    );
  }

  /** Lấy proof riêng cho thao tác/phiên bằng đúng một phương thức thật. */
  reauthenticate(
    operation: SensitiveOperation,
    method: { password: string } | OtpProof,
  ): Promise<{ reauthProof: string; expiresIn: number }> {
    return firstValueFrom(
      this.http.post<{ reauthProof: string; expiresIn: number }>(`${this.base}/reauthenticate`, {
        operation,
        ...method,
      }),
    );
  }

  /** Giữ cookie trong lời gọi cấp phiên ẩn danh mà không để JavaScript đọc được. */
  private publicOptions() {
    return { context: new HttpContext().set(ANONYMOUS, true), withCredentials: true };
  }
}
