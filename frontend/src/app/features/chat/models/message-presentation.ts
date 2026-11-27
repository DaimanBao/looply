import type { ChatMessage } from './chat.models';

/** So ngày theo timezone người xem, không dùng UTC slice gây sai mốc nửa đêm. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Nhãn Hôm nay/Hôm qua dùng ngày lịch địa phương, gồm cả thời điểm chuyển DST. */
export function dayLabel(value: string, now = new Date()): string {
  const date = new Date(value);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return 'Hôm nay';
  if (dayKey(date) === dayKey(yesterday)) return 'Hôm qua';
  return new Intl.DateTimeFormat('vi-VN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** Chỉ nhóm tin liên tiếp cùng sender/ngày trong 5 phút; card giữ phân cách riêng. */
export function groupedMessages(messages: ChatMessage[]) {
  const rows = messages.map((message) => {
    const date = new Date(message.createdAt);
    return { message, day: dayKey(date), time: date.getTime() };
  });
  const joinsPrevious = rows.map(({ message, day, time }, index) => {
    const previous = rows[index - 1];
    return (
      previous !== undefined &&
      previous.message.type === 'TEXT' &&
      message.type === 'TEXT' &&
      previous.message.senderId === message.senderId &&
      previous.day === day &&
      time - previous.time < 5 * 60_000
    );
  });

  // Hai phía của cùng một ranh giới dùng chung quyết định nhóm tin.
  return rows.map(({ message, day }, index) => ({
    message,
    grouped: joinsPrevious[index],
    endGroup: !joinsPrevious[index + 1],
    separator: rows[index - 1]?.day === day ? null : dayLabel(message.createdAt),
  }));
}
