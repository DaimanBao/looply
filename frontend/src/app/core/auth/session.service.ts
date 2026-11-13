import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Observable,
  catchError,
  defer,
  finalize,
  firstValueFrom,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { API_BASE, API_TIMEOUT_MS } from '../http/api.config';
import { decodeTokens } from '../http/api.decode';
import type { AccountStatus, SessionTokens } from '../http/api.models';

@Injectable({ providedIn: 'root' })
export class SessionService {
  // Bỏ qua interceptor cho endpoint chỉ cookie để tránh vòng phụ thuộc hoặc đệ quy refresh.
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly base = inject(API_BASE);
  private readonly timeout = inject(API_TIMEOUT_MS);
  private readonly accessToken = signal<string | null>(null);
  private readonly accountStatus = signal<AccountStatus | null>(null);
  private refreshRequest?: Observable<SessionTokens>;
  private generation = 0;
  private expiresAt = 0;
  private loggingOut = false;
  readonly token = this.accessToken.asReadonly();
  readonly status = this.accountStatus.asReadonly();
  readonly authenticated = computed(() => this.token() !== null);
  readonly active = computed(() => this.status() === 'ACTIVE');
  readonly startupError = signal(false);

  /** Nhận diện ranh giới đăng nhập/xóa quyền, không coi luân chuyển token thường là danh tính mới. */
  identityVersion(): number {
    return this.generation;
  }

  /** Phân biệt credential dùng một lần sai với phiên bị thu hồi mà không phát lại thay đổi. */
  validateAuthority(): Observable<void> {
    const generation = this.generation;
    const token = this.token();
    if (!token) return of(undefined);
    return this.http
      .get<unknown>(`${this.base}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: this.timeout,
      })
      .pipe(
        map(() => undefined),
        catchError((error: unknown) => {
          if (
            error instanceof HttpErrorResponse &&
            error.status === 401 &&
            generation === this.generation &&
            this.token() === token
          )
            this.clear();
          return of(undefined);
        }),
      );
  }

  /** Chỉ áp dụng response API đã kiểm tra; tài khoản chờ xóa không ngầm trở lại hoạt động. */
  accept(payload: unknown): SessionTokens {
    this.generation++;
    return this.install(payload);
  }

  /** Áp dụng phiên đã kiểm tra, để bên gọi kiểm soát vô hiệu hóa response cũ. */
  private install(payload: unknown): SessionTokens {
    const tokens = decodeTokens(payload);
    if (tokens.status === 'DELETING' || tokens.status === 'DELETED') {
      this.clear();
      throw new Error('Tài khoản đã ngừng hoạt động.');
    }
    this.accessToken.set(tokens.accessToken);
    this.expiresAt = Date.now() + tokens.expiresIn * 1000;
    this.accountStatus.set(tokens.status);
    this.startupError.set(false);
    return tokens;
  }

  /** Vô hiệu hóa response refresh đang chạy cùng quyền trong bộ nhớ. */
  clear(): void {
    this.generation++;
    this.expiresAt = 0;
    this.accessToken.set(null);
    this.accountStatus.set(null);
  }

  /** Refresh trước khi gửi thay đổi, tránh phát lại OTP/proof dùng một lần sau hết hạn. */
  expiresSoon(): boolean {
    return this.expiresAt <= Date.now() + 30000;
  }

  /** Dùng chung một lượt luân chuyển cho subscriber đồng thời, không thử lại lượt luân chuyển lỗi. */
  refresh(): Observable<SessionTokens> {
    if (this.loggingOut) return throwError(() => new Error('Đang đăng xuất.'));
    if (this.refreshRequest) return this.refreshRequest;
    const generation = this.generation;
    this.refreshRequest = this.http
      .post<unknown>(
        `${this.base}/auth/refresh`,
        {},
        { withCredentials: true, timeout: this.timeout },
      )
      .pipe(
        map((payload) => {
          if (generation !== this.generation) throw new Error('Phiên đã thay đổi.');
          return this.install(payload);
        }),
        catchError((error: unknown) => {
          if (generation === this.generation) this.clear();
          return throwError(() => error);
        }),
        finalize(() => {
          this.refreshRequest = undefined;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.refreshRequest;
  }

  /** Khôi phục phiên khi tải lại trước route guard; lỗi hạ tầng vẫn hiển thị. */
  async restore(): Promise<void> {
    try {
      await firstValueFrom(this.refresh());
    } catch (error) {
      this.startupError.set(!(error instanceof HttpErrorResponse && error.status === 401));
    }
  }

  /** Thu hồi quyền server trước khi xóa bộ nhớ; lỗi vẫn hiển thị và có thể thử lại. */
  logout(): Observable<void> {
    return defer(() => {
      this.loggingOut = true;
      const rotating = this.refreshRequest;
      return (
        rotating
          ? rotating.pipe(
              map(() => undefined),
              catchError(() => of(undefined)),
            )
          : of(undefined)
      ).pipe(
        // Luân chuyển cookie hoàn tất trước để đăng xuất thu hồi token thay thế.
        switchMap(() =>
          this.http.post<void>(
            `${this.base}/auth/logout`,
            {},
            { withCredentials: true, timeout: this.timeout },
          ),
        ),
        tap(() => this.clear()),
        finalize(() => {
          this.loggingOut = false;
        }),
      );
    });
  }
}
