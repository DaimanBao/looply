import { record } from '../../../core/http/api.decode';
import type {
  ChatConversation,
  ChatListing,
  ChatMessage,
  ChatPage,
  ChatProposal,
  ChatSnapshot,
} from '../models/chat.models';

/** Từ chối payload khác contract thay vì ép unknown thành DTO được tin cậy. */
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Phản hồi Chat không hợp lệ.');
  return value;
}

/** Phân biệt null hợp lệ với thiếu trường trong response. */
function optionalText(value: unknown): string | null {
  return value === null ? null : text(value);
}

/** Kiểm tra tập enum hữu hạn và giữ kiểu literal cho template. */
function choice<const T extends string>(value: unknown, choices: readonly T[]): T {
  const result = choices.find((item) => item === value);
  if (!result) throw new Error('Trạng thái Chat không hợp lệ.');
  return result;
}

/** Kiểm tra UUID trước khi ghép đường dẫn tài nguyên. */
function id(value: unknown): string {
  const result = text(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result))
    throw new Error('Định danh Chat không hợp lệ.');
  return result;
}

/** Đường dẫn media chỉ được phép về đúng API nội bộ; không nhận URL bên thứ ba. */
function mediaPath(value: unknown): string | null {
  const result = optionalText(value);
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const allowed = new RegExp(
    `^/api/(?:conversations/${uuid}/messages/${uuid}/(?:image|snapshot)|listings/${uuid}/media/${uuid}\\?variant=thumbnail)$`,
    'i',
  );
  if (result !== null && !allowed.test(result)) throw new Error('Đường dẫn ảnh không hợp lệ.');
  return result;
}

/** Giá tiền được giữ dạng chuỗi để không mất độ chính xác Decimal. */
function price(value: unknown): string | null {
  const result = optionalText(value);
  if (result !== null && !/^[1-9][0-9]{0,14}$/.test(result))
    throw new Error('Giá giao dịch không hợp lệ.');
  return result;
}

/** Kiểm tra timestamp tại ranh giới HTTP. */
function date(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error('Thời gian Chat không hợp lệ.');
  return result;
}

/** Mã thuê của server không được thay đổi khi nhập giá thương lượng. */
function unit(value: unknown): 'DAY' | 'MONTH' | null {
  return value === null ? null : choice(value, ['DAY', 'MONTH']);
}

/** Thông tin Listing hiện tại chỉ phục vụ card ngữ cảnh, không ghi đè snapshot cũ. */
function listing(value: unknown): ChatListing | null {
  if (value === null) return null;
  const row = record(value);
  return {
    id: id(row['id']),
    ownerId: id(row['ownerId']),
    title: text(row['title']),
    type: choice(row['type'], ['SALE', 'RENT', 'EXCHANGE']),
    status: choice(row['status'], ['ACTIVE', 'HIDDEN', 'DELETED']),
    price: price(row['price']),
    rentalUnit: unit(row['rentalUnit']),
    coverPath: mediaPath(row['coverPath']),
  };
}

/** Kiểm tra Inbox/detail có đúng hai participant và số chưa đọc không âm. */
export function decodeConversation(value: unknown): ChatConversation {
  const row = record(value);
  if (
    !Array.isArray(row['participants']) ||
    row['participants'].length !== 2 ||
    typeof row['unreadCount'] !== 'number' ||
    !Number.isSafeInteger(row['unreadCount']) ||
    row['unreadCount'] < 0 ||
    typeof row['hidden'] !== 'boolean'
  )
    throw new Error('Hội thoại không hợp lệ.');
  return {
    id: id(row['id']),
    type: choice(row['type'], ['DIRECT', 'LISTING']),
    participants: row['participants'].map((value: unknown) => {
      const p = record(value);
      return {
        userId: id(p['userId']),
        displayName: text(p['displayName']),
        status: choice(p['status'], ['ACTIVE', 'PENDING_DELETION', 'DELETING', 'DELETED']),
      };
    }),
    listing: listing(row['listing']),
    unreadCount: row['unreadCount'],
    hidden: row['hidden'],
    createdAt: date(row['createdAt']),
    lastMessageAt: row['lastMessageAt'] === null ? null : date(row['lastMessageAt']),
  };
}

/** Chỉ nhận proposal đúng enum và giá, không lấy quyền thao tác từ payload client. */
function proposal(value: unknown): ChatProposal | null {
  if (value === null) return null;
  const row = record(value);
  return {
    id: id(row['id']),
    kind: choice(row['kind'], ['LISTED_PRICE', 'NEGOTIATED_PRICE', 'EXCHANGE_CONTACT']),
    status: choice(row['status'], ['PENDING', 'ACCEPTED', 'REJECTED']),
    type: choice(row['type'], ['SALE', 'RENT', 'EXCHANGE']),
    listedPrice: price(row['listedPrice']),
    proposedPrice: price(row['proposedPrice']),
    rentalUnit: unit(row['rentalUnit']),
  };
}

/** Snapshot thiếu/hết hạn ảnh luôn có thể hiển thị text và placeholder. */
function snapshot(value: unknown): ChatSnapshot | null {
  if (value === null) return null;
  const row = record(value);
  if (typeof row['imageAvailable'] !== 'boolean') throw new Error('Snapshot không hợp lệ.');
  return {
    listingId: id(row['listingId']),
    title: text(row['title']),
    type: choice(row['type'], ['SALE', 'RENT', 'EXCHANGE']),
    listedPrice: price(row['listedPrice']),
    rentalUnit: unit(row['rentalUnit']),
    imageAvailable: row['imageAvailable'],
    imagePath: mediaPath(row['imagePath']),
  };
}

/** Tin nhắn chỉ hiển thị text qua Angular interpolation, không chèn HTML người dùng. */
export function decodeMessage(value: unknown): ChatMessage {
  const row = record(value);
  return {
    id: id(row['id']),
    conversationId: id(row['conversationId']),
    senderId: id(row['senderId']),
    requestId: id(row['requestId']),
    type: choice(row['type'], ['TEXT', 'TRANSACTION_CARD']),
    content: optionalText(row['content']),
    createdAt: date(row['createdAt']),
    state: choice(row['state'], ['SENT', 'DELIVERED', 'READ']),
    imagePath: mediaPath(row['imagePath']),
    proposal: proposal(row['proposal']),
    snapshot: snapshot(row['snapshot']),
  };
}

/** Giới hạn trang như contract và giữ cursor opaque để server xác minh phạm vi. */
export function decodeChatPage<T>(value: unknown, decode: (item: unknown) => T): ChatPage<T> {
  const row = record(value);
  if (!Array.isArray(row['data']) || row['data'].length > 50)
    throw new Error('Trang Chat không hợp lệ.');
  return {
    data: row['data'].map(decode),
    pagination: { nextCursor: optionalText(record(row['pagination'])['nextCursor']) },
  };
}
