import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { SessionService } from './session.service';

/** Routes pending accounts exclusively to their explicit cancellation screen. */
export const activeGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  if (session.status() === 'PENDING_DELETION') return router.createUrlTree(['/account/deletion']);
  return (
    session.active() ||
    router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } })
  );
};
/** Allows the deletion status page only for authenticated active/pending accounts. */
export const sessionGuard: CanActivateFn = () =>
  inject(SessionService).authenticated() || inject(Router).createUrlTree(['/auth/login']);
/** Prevents pending users reaching ordinary public interaction pages while signed in. */
export const publicGuard: CanActivateFn = () =>
  inject(SessionService).status() !== 'PENDING_DELETION' ||
  inject(Router).createUrlTree(['/account/deletion']);
