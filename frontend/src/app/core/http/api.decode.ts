import type { AccountStatus, SessionTokens } from './api.models';

/** Kiểm tra ranh giới object JSON không tin cậy mà không ép kiểu thiếu an toàn. */
export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Phản hồi máy chủ không hợp lệ.');
  return Object.fromEntries(Object.entries(value));
}
/** Từ chối payload phiên sai định dạng trước khi cấp quyền phía client. */
export function decodeTokens(value: unknown): SessionTokens {
  const payload = record(value);
  const status = payload['status'];
  if (
    typeof payload['accessToken'] !== 'string' ||
    !payload['accessToken'] ||
    payload['expiresIn'] !== 900 ||
    !isAccountStatus(status)
  )
    throw new Error('Phản hồi phiên không hợp lệ.');
  return { accessToken: payload['accessToken'], expiresIn: 900, status };
}
/** Giới hạn giá trị vòng đời tài khoản theo contract đã duyệt. */
function isAccountStatus(value: unknown): value is AccountStatus {
  return (
    value === 'ACTIVE' ||
    value === 'PENDING_DELETION' ||
    value === 'DELETING' ||
    value === 'DELETED'
  );
}
