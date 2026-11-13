import { HttpErrorResponse } from '@angular/common/http';

/** Gives useful Vietnamese feedback without echoing provider internals or sensitive request values. */
export function apiError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse))
    return 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
  const body: unknown = error.error;
  if (body && typeof body === 'object' && 'error' in body) {
    const detail = body.error;
    if (detail && typeof detail === 'object' && 'code' in detail) {
      if (detail.code === 'UNSAFE_PASSWORD')
        return 'Mật khẩu đã xuất hiện trong dữ liệu rò rỉ. Hãy chọn mật khẩu khác.';
      if (detail.code === 'INVALID_PROVINCE')
        return 'Vui lòng chọn tỉnh/thành phố đang hoạt động trong danh mục.';
      if (detail.code === 'OTP_LIMIT')
        return 'Chưa thể gửi mã mới. Chờ ít nhất 60 giây giữa hai lần gửi; vượt hạn mức có thể bị khóa 15 phút.';
    }
  }
  switch (error.status) {
    case 0:
      return 'Không kết nối được máy chủ. Kiểm tra kết nối và thử lại.';
    case 400:
      return 'Thông tin chưa hợp lệ. Kiểm tra các trường và thử lại.';
    case 401:
      return 'Thông tin xác thực hoặc mã xác minh không hợp lệ, đã dùng hoặc hết hạn.';
    case 403:
      return 'Tài khoản không có quyền thực hiện thao tác này.';
    case 404:
      return 'Không tìm thấy hồ sơ hoặc nội dung bạn được phép xem.';
    case 409:
      return 'Thông tin đã được sử dụng hoặc thao tác chưa được phép ở trạng thái hiện tại.';
    case 413:
      return 'Tệp quá lớn. Vui lòng chọn ảnh tối đa 10 MiB.';
    case 415:
      return 'Định dạng tệp không được hỗ trợ. Chọn JPEG, PNG hoặc WebP.';
    case 429:
      return 'Bạn thao tác quá nhanh. Vui lòng chờ trước khi thử lại.';
    case 503:
      return 'Dịch vụ xác minh tạm thời chưa sẵn sàng. Vui lòng thử lại sau.';
    default:
      return 'Máy chủ chưa xử lý được yêu cầu. Vui lòng thử lại sau.';
  }
}
