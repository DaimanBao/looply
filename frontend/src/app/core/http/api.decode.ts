import type { AccountStatus, SessionTokens } from './api.models';

/** Checks untrusted JSON object boundaries without unsafe casts. */
export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Phản hồi máy chủ không hợp lệ.');
  return Object.fromEntries(Object.entries(value));
}
/** Rejects malformed session payloads before they can grant client-side access. */
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
/** Restricts account lifecycle values to the approved contract. */
function isAccountStatus(value: unknown): value is AccountStatus {
  return (
    value === 'ACTIVE' ||
    value === 'PENDING_DELETION' ||
    value === 'DELETING' ||
    value === 'DELETED'
  );
}
