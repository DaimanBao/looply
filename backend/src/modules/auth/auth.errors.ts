import { AppError } from "../../shared/errors/app-error";

/** Trả cùng lỗi công khai cho tài khoản không tồn tại, thông tin xác thực sai và phiên hết hạn/bị thu hồi. */
export function unauthorized(): AppError {
  return new AppError(401, "UNAUTHENTICATED", "Authentication failed.");
}
/** Từ chối vi phạm trạng thái hoặc phân quyền mà không tiết lộ dữ liệu nội bộ. */
export function forbidden(): AppError {
  return new AppError(403, "FORBIDDEN", "This operation is not permitted.");
}
/** Đánh dấu phụ thuộc bảo mật bên ngoài không khả dụng; bên gọi phải từ chối an toàn. */
export function unavailable(): AppError {
  return new AppError(503, "AUTH_UNAVAILABLE", "Authentication is temporarily unavailable.");
}
/** Báo đầu vào tài khoản sai hoặc xung đột theo contract lỗi công khai dùng chung. */
export function conflict(message: string): AppError {
  return new AppError(409, "ACCOUNT_CONFLICT", message);
}
