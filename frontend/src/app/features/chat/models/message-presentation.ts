import type { ChatMessage } from './chat.models';

/** So ngày theo timezone người xem, không dùng UTC slice gây sai mốc nửa đêm. */
export function dayKey(date: Date): string {
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
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const day = dayKey(new Date(message.createdAt));
    const grouped =
      !!previous &&
      previous.type === 'TEXT' &&
      message.type === 'TEXT' &&
      previous.senderId === message.senderId &&
      dayKey(new Date(previous.createdAt)) === day &&
      new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 300000;
    const endGroup =
      !next ||
      next.senderId !== message.senderId ||
      next.type !== 'TEXT' ||
      message.type !== 'TEXT' ||
      dayKey(new Date(next.createdAt)) !== day ||
      new Date(next.createdAt).getTime() - new Date(message.createdAt).getTime() >= 300000;
    return {
      message,
      grouped,
      endGroup,
      separator:
        !previous || dayKey(new Date(previous.createdAt)) !== day
          ? dayLabel(message.createdAt)
          : null,
    };
  });
}
