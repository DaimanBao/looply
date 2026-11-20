import { record } from '../../../core/http/api.decode';
import type { NotificationItem, NotificationPage } from '../models/notification.models';

/** Kiểm tra UUID trước khi dùng trong URL nội bộ. */
export function notificationId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
    throw new Error('Định danh thông báo không hợp lệ.');
  return value;
}

/** Null hợp lệ khác với field thiếu hoặc sai định dạng. */
function nullableId(value: unknown): string | null {
  return value === null ? null : notificationId(value);
}

/** Kiểm tra timestamp response trước khi hiển thị hoặc gửi read-all boundary. */
function date(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new Error('Thời gian thông báo không hợp lệ.');
  return value;
}

/** Projection tường minh loại preview hoặc dữ liệu ngoài contract. */
export function decodeNotification(value: unknown): NotificationItem {
  const row = record(value);
  const type = row['type'];
  const isRead = row['isRead'];
  if (
    (type !== 'MESSAGE' && type !== 'TRANSACTION' && type !== 'LISTING_UPDATED') ||
    typeof isRead !== 'boolean'
  )
    throw new Error('Thông báo không hợp lệ.');
  return {
    id: notificationId(row['id']),
    type,
    isRead,
    conversationId: nullableId(row['conversationId']),
    listingId: nullableId(row['listingId']),
    proposalId: nullableId(row['proposalId']),
    latestMessageId: nullableId(row['latestMessageId']),
    lastEventId: nullableId(row['lastEventId']),
    createdAt: date(row['createdAt']),
    updatedAt: date(row['updatedAt']),
  };
}

/** Chỉ chấp nhận trang có cursor đúng kiểu và server boundary hợp lệ. */
export function decodeNotificationPage(value: unknown): NotificationPage {
  const row = record(value);
  const pagination = record(row['pagination']);
  const cursor = pagination['nextCursor'];
  if (!Array.isArray(row['data']) || (cursor !== null && typeof cursor !== 'string'))
    throw new Error('Trang thông báo không hợp lệ.');
  return {
    data: row['data'].map(decodeNotification),
    pagination: { nextCursor: cursor },
    asOf: date(row['asOf']),
  };
}
