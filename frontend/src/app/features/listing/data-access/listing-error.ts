import { HttpErrorResponse } from '@angular/common/http';
import { apiError } from '../../../core/http/api-error';

/** Đọc mã lỗi công khai, không phản chiếu thông điệp storage hoặc dữ liệu nhạy cảm. */
export function listingErrorCode(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return '';
  const body: unknown = error.error;
  if (!body || typeof body !== 'object' || !('error' in body)) return '';
  const detail = body.error;
  return detail && typeof detail === 'object' && 'code' in detail && typeof detail.code === 'string'
    ? detail.code
    : '';
}

/** Giải thích cách khắc phục lỗi Listing/Media đúng lifecycle hiện hành. */
export function listingError(error: unknown): string {
  const messages: Record<string, string> = {
    LISTING_VERSION_CONFLICT: 'Bài đăng đã thay đổi. Tải lại dữ liệu trước khi thao tác tiếp.',
    LISTING_TYPE_LOCKED: 'Bài đã có hội thoại nên không thể đổi loại giao dịch. Hãy tải lại.',
    LISTING_CONFIRMATION_REQUIRED:
      'Cần xác nhận tác động đến hội thoại hoặc việc mở lại bài. Hãy tải lại.',
    LISTING_REOPEN_REQUIRED: 'Hãy hiện lại bài đã có giao dịch được chấp nhận trước khi sửa.',
    MEDIA_NOT_AVAILABLE: 'Media tạm đã hết hạn hoặc không còn dùng được. Bỏ tệp và chọn lại.',
    MEDIA_NOT_READY: 'Media chưa sẵn sàng. Hãy thử lại sau.',
    MEDIA_VIDEO_UNAVAILABLE: 'Chưa xử lý được video. Hãy thử lại sau hoặc chọn tệp khác.',
  };
  if (error instanceof HttpErrorResponse) {
    if (error.status === 413) return 'Tệp quá lớn: ảnh tối đa 10 MiB, video tối đa 100 MiB.';
    if (error.status === 415)
      return 'Tệp không hợp lệ. Chọn JPEG/PNG/WebP hoặc MP4/WebM tối đa 180 giây.';
  }
  return messages[listingErrorCode(error)] ?? apiError(error);
}
