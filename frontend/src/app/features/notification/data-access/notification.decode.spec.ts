import { decodeNotification, decodeNotificationPage } from './notification.decode';

describe('Notification decoder', () => {
  const id = '6cdd4946-be64-4dd0-a6c7-31125305c975';
  const row = {
    id,
    type: 'MESSAGE',
    conversationId: id,
    listingId: null,
    proposalId: null,
    latestMessageId: id,
    lastEventId: id,
    isRead: false,
    createdAt: '2026-11-20T00:00:00Z',
    updatedAt: '2026-11-20T00:00:00Z',
  };

  it('projects only the contract, excluding message preview', () => {
    expect(decodeNotification({ ...row, content: 'Private' })).toEqual(row);
  });

  it('rejects unknown type, malformed target IDs, unread/count and missing timestamps', () => {
    for (const bad of [
      { ...row, type: 'PUSH' },
      { ...row, conversationId: 'https://evil.test' },
      { ...row, isRead: 'false' },
      { ...row, updatedAt: undefined },
    ])
      expect(() => decodeNotification(bad)).toThrow();
    expect(() =>
      decodeNotificationPage({ data: [row], pagination: { nextCursor: 1 }, asOf: row.createdAt }),
    ).toThrow();
  });
});
