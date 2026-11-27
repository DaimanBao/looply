import type { AccountStatus } from '../http/api.models';

/** Chọn đường dẫn nội bộ sau khi đăng nhập hoặc khôi phục phiên từ trang đăng nhập. */
export function sessionDestination(status: AccountStatus | null, requested: string | null): string {
  if (status === 'PENDING_DELETION') return '/account/deletion';
  return requested?.startsWith('/') &&
    !requested.startsWith('//') &&
    !requested.startsWith('/auth/')
    ? requested
    : '/account';
}
