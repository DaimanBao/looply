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
  /** Public credential exchanges deliberately omit any previous bearer identity. */
  login(username: string, password: string): Promise<unknown> {
    return firstValueFrom(
      this.http.post<unknown>(
        `${this.base}/login/password`,
        { username: username.toLowerCase(), password },
        this.publicOptions(),
      ),
    );
  }
  /** Submits the delivered one-use challenge to the real phone login endpoint. */
  phoneLogin(phone: string, proof: OtpProof): Promise<unknown> {
    return firstValueFrom(
      this.http.post<unknown>(
        `${this.base}/login/phone`,
        { phone, ...proof },
        this.publicOptions(),
      ),
    );
  }
  /** Sends verified registration data and lets the server establish the cookie. */
  register(input: Registration): Promise<unknown> {
    return firstValueFrom(
      this.http.post<unknown>(
        `${this.base}/register`,
        { ...input, username: input.username.toLowerCase() },
        this.publicOptions(),
      ),
    );
  }
  /** Protected OTP purposes retain the current bearer; codes never appear in this response. */
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
  /** Resets a verified contact's credentials; all server sessions are revoked. */
  reset(destination: string, password: string, proof: OtpProof): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(
        `${this.base}/password/reset`,
        { destination, password, ...proof },
        this.publicOptions(),
      ),
    );
  }
  /** Obtains an operation/session-specific proof using exactly one real method. */
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
  /** Keeps the cookie on anonymous session-issuing calls without exposing it to JavaScript. */
  private publicOptions() {
    return { context: new HttpContext().set(ANONYMOUS, true), withCredentials: true };
  }
}
