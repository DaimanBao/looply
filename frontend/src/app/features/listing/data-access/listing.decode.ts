import { record } from '../../../core/http/api.decode';
import type { Province, PublicProfile } from '../../../core/http/api.models';
import type {
  ListingDetail,
  ListingImage,
  ListingItem,
  ListingMedia,
  ListingPage,
  ListingSuggestion,
} from '../models/listing.models';

/** Từ chối response sai định dạng mà không tiết lộ nội dung vào UI. */
function invalid(): never {
  throw new Error('Phản hồi bài đăng không hợp lệ.');
}
/** Đọc chuỗi bắt buộc tại ranh giới JSON không tin cậy. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : invalid();
}
/** Đọc chuỗi nullable theo contract, không âm thầm ép giá trị thiếu. */
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
/** Đọc boolean mà không ép theo truthiness. */
function bool(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalid();
}
/** Chỉ chấp nhận metadata số nguyên có giới hạn. */
function integer(value: unknown, min: number, max = 2147483647): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : invalid();
}
/** Giới hạn định danh là UUID tài nguyên trước khi tạo URL phân phối. */
function uuid(value: unknown): string {
  const id = text(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? id
    : invalid();
}
/** Kiểm tra ngày trước khi pipe template nhận dữ liệu. */
function date(value: unknown): string {
  const result = text(value);
  return Number.isFinite(Date.parse(result)) ? result : invalid();
}
/** Đọc projection Province do server quản lý. */
function province(value: unknown): Province {
  const row = record(value);
  return { code: text(row['code']), name: text(row['name']) };
}
/** Chỉ giữ trường chủ sở hữu công khai; khóa response riêng thừa không vào view model. */
function owner(value: unknown): PublicProfile {
  const row = record(value);
  return {
    id: uuid(row['id']),
    username: nullableText(row['username']),
    displayName: text(row['displayName']),
    bio: nullableText(row['bio']),
    province: row['province'] === null ? null : province(row['province']),
    avatarUrl: nullableText(row['avatarUrl']),
    followers: integer(row['followers'], 0),
    following: integer(row['following'], 0),
  };
}
/** Kiểm tra media phân biệt theo loại và bảo đảm đường dẫn phân phối thuộc đúng Listing này. */
function media(value: unknown, listingId: string): ListingMedia {
  const row = record(value);
  const id = uuid(row['id']);
  const deliveryPath = text(row['deliveryPath']);
  if (deliveryPath !== `/api/listings/${listingId}/media/${id}`) invalid();
  const sizeBytes = text(row['sizeBytes']);
  if (!/^[1-9][0-9]*$/.test(sizeBytes)) invalid();
  if (
    row['type'] === 'IMAGE' &&
    row['mimeType'] === 'image/webp' &&
    row['durationSeconds'] === null
  ) {
    return {
      id,
      deliveryPath,
      sizeBytes,
      type: 'IMAGE',
      mimeType: 'image/webp',
      durationSeconds: null,
      position: integer(row['position'], 0, 4),
      isCover: bool(row['isCover']),
    };
  }
  if (
    row['type'] === 'VIDEO' &&
    (row['mimeType'] === 'video/mp4' || row['mimeType'] === 'video/webm') &&
    row['position'] === null &&
    row['isCover'] === false
  ) {
    return {
      id,
      deliveryPath,
      sizeBytes,
      type: 'VIDEO',
      mimeType: row['mimeType'],
      position: null,
      isCover: false,
      durationSeconds: integer(row['durationSeconds'], 1, 180),
    };
  }
  return invalid();
}
/** Giải mã projection chung và thực thi bất biến tiền tệ SALE/RENT/EXCHANGE. */
function item(value: unknown): ListingItem {
  const row = record(value);
  const id = uuid(row['id']);
  const type = row['type'];
  const status = row['status'];
  const price = nullableText(row['price']);
  const rentalUnit = row['rentalUnit'];
  if (rentalUnit !== null && rentalUnit !== 'DAY' && rentalUnit !== 'MONTH') invalid();
  if (type !== 'SALE' && type !== 'RENT' && type !== 'EXCHANGE') invalid();
  if (status !== 'ACTIVE' && status !== 'HIDDEN' && status !== 'DELETED') invalid();
  if (type === 'EXCHANGE' ? price !== null : price === null || !/^[1-9][0-9]{0,14}$/.test(price))
    invalid();
  if (type === 'RENT' ? rentalUnit !== 'DAY' && rentalUnit !== 'MONTH' : rentalUnit !== null)
    invalid();
  const cover = media(row['cover'], id);
  if (cover.type !== 'IMAGE' || !cover.isCover) invalid();
  return {
    id,
    type,
    status,
    price,
    rentalUnit,
    title: text(row['title']),
    cover,
    province: province(row['province']),
    owner: owner(row['owner']),
    isFollowed: bool(row['isFollowed']),
    createdAt: date(row['createdAt']),
    updatedAt: date(row['updatedAt']),
  };
}
/** Chỉ nhận hàng ACTIVE công khai và cursor tiếp theo opaque có giới hạn. */
export function decodeListingPage(value: unknown): ListingPage {
  const row = record(value);
  if (!Array.isArray(row['data']) || row['data'].length > 48) invalid();
  const data = row['data'].map(item);
  if (data.some((listing) => listing.status !== 'ACTIVE')) invalid();
  const nextCursor = nullableText(record(row['pagination'])['nextCursor']);
  if (nextCursor !== null && !/^[A-Za-z0-9_-]{1,2048}$/.test(nextCursor)) invalid();
  return { data, pagination: { nextCursor } };
}
/** Kiểm tra manifest media chi tiết đầy đủ, giữ quyết định truy cập của server. */
export function decodeListingDetail(value: unknown): ListingDetail {
  const row = record(value);
  const listing = item(row);
  if (listing.status === 'DELETED' || !Array.isArray(row['media'])) invalid();
  const assets = row['media'].map((asset) => media(asset, listing.id));
  const images = assets.filter((asset): asset is ListingImage => asset.type === 'IMAGE');
  if (
    images.length < 1 ||
    images.length > 5 ||
    assets.length - images.length > 1 ||
    new Set(assets.map((asset) => asset.id)).size !== assets.length ||
    images.filter((image) => image.isCover).length !== 1 ||
    !images.some((image) => image.id === listing.cover.id && image.isCover)
  )
    invalid();
  const contactPhone = nullableText(row['contactPhone']);
  if (contactPhone !== null && !/^\+[1-9][0-9]{7,14}$/.test(contactPhone)) invalid();
  return {
    ...listing,
    description: text(row['description']),
    contactPhone,
    media: assets,
    version: integer(row['version'], 1),
    activeCycle: integer(row['activeCycle'], 1),
    hasConversations: bool(row['hasConversations']),
    hasAcceptedProposal: bool(row['hasAcceptedProposal']),
  };
}
/** Chỉ đọc gợi ý tiêu đề từ server, không triển khai tìm khớp local. */
export function decodeSuggestions(value: unknown): ListingSuggestion[] {
  const rows = record(value)['data'];
  if (!Array.isArray(rows) || rows.length > 8) invalid();
  return rows.map((value) => {
    const row = record(value);
    return { id: uuid(row['id']), title: text(row['title']) };
  });
}
