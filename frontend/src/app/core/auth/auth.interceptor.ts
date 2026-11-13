import { HttpContextToken, HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { API_BASE, API_TIMEOUT_MS } from '../http/api.config';
import { SessionService } from './session.service';

export const ANONYMOUS = new HttpContextToken<boolean>(() => false);

/** Giới hạn credential trong API này và chỉ thử lại yêu cầu bearer tối đa một lần sau luân chuyển chung. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionService);
  const base = inject(API_BASE);
  const timeout = inject(API_TIMEOUT_MS);
  if (!request.url.startsWith(`${base}/`)) return next(request);
  request = request.clone({ timeout: request.timeout ?? timeout });
  if (request.context.get(ANONYMOUS)) return next(request);
  const token = session.token();
  const identityVersion = session.identityVersion();
  /** Lần thử lại vẫn chưa được xác thực không thể giữ cùng quyền local. */
  const send = (accessToken: string) =>
    next(request.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })).pipe(
      catchError((error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 401 &&
          session.token() === accessToken
        ) {
          if (['GET', 'HEAD'].includes(request.method)) session.clear();
          else return session.validateAuthority().pipe(switchMap(() => throwError(() => error)));
        }
        return throwError(() => error);
      }),
    );
  if (token && session.expiresSoon())
    return session.refresh().pipe(switchMap((tokens) => send(tokens.accessToken)));
  const authorized = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;
  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !token)
        return throwError(() => error);
      if (identityVersion !== session.identityVersion()) return throwError(() => error);
      // OTP/mật khẩu sai cũng trả 401: không phát lại thao tác thay đổi credential.
      if (!['GET', 'HEAD'].includes(request.method))
        return session.validateAuthority().pipe(switchMap(() => throwError(() => error)));
      const current = session.token();
      if (current && current !== token) return send(current);
      return session.refresh().pipe(switchMap((tokens) => send(tokens.accessToken)));
    }),
  );
};
