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
  // Bypass interceptors for cookie-only endpoints to avoid a dependency cycle or refresh recursion.
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

  /** Identifies login/clear boundaries without treating ordinary token rotation as a new identity. */
  identityVersion(): number {
    return this.generation;
  }

  /** Distinguishes an invalid one-use credential from a revoked session without replaying a mutation. */
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

  /** Installs only a validated API response; pending deletion never becomes active implicitly. */
  accept(payload: unknown): SessionTokens {
    this.generation++;
    return this.install(payload);
  }
  /** Applies a validated session while letting the caller control stale-response invalidation. */
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
  /** Invalidates in-flight refresh responses as well as in-memory authority. */
  clear(): void {
    this.generation++;
    this.expiresAt = 0;
    this.accessToken.set(null);
    this.accountStatus.set(null);
  }
  /** Refreshes before mutation submission, avoiding replay of a one-use OTP/proof after expiry. */
  expiresSoon(): boolean {
    return this.expiresAt <= Date.now() + 30000;
  }

  /** Shares one rotation among concurrent subscribers and never retries a failed rotation. */
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
  /** Restores a reload session before route guards; infrastructure errors remain visible. */
  async restore(): Promise<void> {
    try {
      await firstValueFrom(this.refresh());
    } catch (error) {
      this.startupError.set(!(error instanceof HttpErrorResponse && error.status === 401));
    }
  }
  /** Revokes server authority before clearing memory; failure stays visible and can be retried. */
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
        // Cookie rotation finishes first so logout revokes the replacement token.
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
