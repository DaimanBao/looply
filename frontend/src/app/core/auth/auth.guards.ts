import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { SessionService } from './session.service';

/** Chỉ đưa tài khoản chờ xóa đến màn hình hủy tường minh. */
export const activeGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  if (session.status() === 'PENDING_DELETION') return router.createUrlTree(['/account/deletion']);
  return (
    session.active() ||
    router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } })
  );
};
/** Chỉ cho tài khoản hoạt động/chờ xóa đã xác thực vào trang trạng thái xóa. */
export const sessionGuard: CanActivateFn = () =>
  inject(SessionService).authenticated() || inject(Router).createUrlTree(['/auth/login']);
/** Ngăn người dùng chờ xóa vào trang tương tác công khai thông thường khi đăng nhập. */
export const publicGuard: CanActivateFn = () =>
  inject(SessionService).status() !== 'PENDING_DELETION' ||
  inject(Router).createUrlTree(['/account/deletion']);
