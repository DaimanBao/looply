export interface NotificationItem {
  id: string;
  type: 'MESSAGE' | 'TRANSACTION' | 'LISTING_UPDATED';
  conversationId: string | null;
  listingId: string | null;
  proposalId: string | null;
  latestMessageId: string | null;
  lastEventId: string | null;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPage {
  data: NotificationItem[];
  pagination: { nextCursor: string | null };
  asOf: string;
}

export const notificationLabels = {
  MESSAGE: 'Bạn có tin nhắn mới trong hội thoại.',
  TRANSACTION: 'Đề xuất giao dịch có hoạt động mới.',
  LISTING_UPDATED: 'Bài đăng trong hội thoại của bạn đã được chỉnh sửa.',
};
