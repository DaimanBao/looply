import { HttpContextToken, HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { API_BASE, API_TIMEOUT_MS } from '../http/api.config';
import { SessionService } from './session.service';

export const ANONYMOUS = new HttpContextToken<boolean>(() => false);

/** Limits credentials to this API and retries a bearer request at most once after shared rotation. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(SessionService);
  const base = inject(API_BASE);
  const timeout = inject(API_TIMEOUT_MS);
  if (!request.url.startsWith(`${base}/`)) return next(request);
  request = request.clone({ timeout: request.timeout ?? timeout });
  if (request.context.get(ANONYMOUS)) return next(request);
  const token = session.token();
  const identityVersion = session.identityVersion();
  /** A retry that is still unauthorized cannot retain the same local authority. */
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
      // An invalid OTP/password is also a 401: do not replay credential mutations.
      if (!['GET', 'HEAD'].includes(request.method))
        return session.validateAuthority().pipe(switchMap(() => throwError(() => error)));
      const current = session.token();
      if (current && current !== token) return send(current);
      return session.refresh().pipe(switchMap((tokens) => send(tokens.accessToken)));
    }),
  );
};
