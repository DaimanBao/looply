import { dayLabel, groupedMessages } from './message-presentation';
import type { ChatMessage } from './chat.models';

/** Fixture tối thiểu giữ dữ liệu ngày giờ cụ thể cho các biên nhóm tin. */
function message(id: string, senderId: string, createdAt: string): ChatMessage {
  return {
    id,
    senderId,
    createdAt,
    conversationId: 'chat',
    requestId: id,
    type: 'TEXT',
    content: 'Xin chào',
    state: 'SENT',
    imagePath: null,
    proposal: null,
    snapshot: null,
  };
}

describe('Chat message presentation', () => {
  it('labels today and yesterday using local calendar dates across month boundaries', () => {
    const now = new Date(2026, 10, 1, 0, 5);
    expect(dayLabel(new Date(2026, 10, 1, 0, 1).toISOString(), now)).toBe('Hôm nay');
    expect(dayLabel(new Date(2026, 9, 31, 23, 59).toISOString(), now)).toBe('Hôm qua');
    expect(dayLabel(new Date(2026, 9, 30, 12).toISOString(), now)).toContain('2026');
  });

  it('groups only consecutive messages from the same sender within five minutes', () => {
    const rows = groupedMessages([
      message('one', 'a', '2026-11-20T01:00:00Z'),
      message('two', 'a', '2026-11-20T01:01:00Z'),
      message('three', 'a', '2026-11-20T01:06:00Z'),
      message('four', 'b', '2026-11-20T01:06:01Z'),
    ]);
    expect(rows.map((row) => row.grouped)).toEqual([false, true, false, false]);
    expect(rows.map((row) => row.endGroup)).toEqual([false, true, true, true]);
  });

  it('separates calendar days and transaction cards', () => {
    const first = message('one', 'a', new Date(2026, 10, 19, 23, 59).toISOString());
    const second = message('two', 'a', new Date(2026, 10, 20, 0, 0).toISOString());
    const third = { ...message('three', 'a', second.createdAt), type: 'TRANSACTION_CARD' as const };
    const rows = groupedMessages([first, second, third]);
    expect(rows[0].separator).not.toBeNull();
    expect(rows[1].separator).not.toBeNull();
    expect(rows[1].grouped).toBe(false);
    expect(rows[2].grouped).toBe(false);
  });
});
