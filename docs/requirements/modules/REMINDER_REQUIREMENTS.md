# Module Reminder — Yêu cầu chức năng (Looply, Đồ án 1)

## 1. Mục tiêu và phạm vi
Nhắc người dùng đã đăng nhập bổ sung thông tin hồ sơ còn thiếu mà không bắt buộc hoàn thành, không chặn tính năng và không gây phiền. Reminder không thay thế các điều kiện xác thực bắt buộc của từng chức năng.

## 2. Danh sách chức năng
| Mã | Chức năng | Yêu cầu |
|---|---|---|
| REM-001 | Kiểm tra hồ sơ | Khi bắt đầu phiên đăng nhập, kiểm tra số điện thoại, email và tỉnh/thành phố; không hiện card nếu đã đầy đủ. |
| REM-002 | Nhắc số điện thoại | Nhắc nếu chưa có số điện thoại đã xác minh; dẫn đến luồng cập nhật/xác minh số điện thoại. |
| REM-003 | Nhắc email | Nhắc nếu chưa có email đã xác minh; dẫn đến luồng cập nhật/xác minh email bằng OTP. |
| REM-004 | Nhắc địa điểm | Nhắc nếu chưa thiết lập tỉnh/thành phố; dẫn đến phần cập nhật địa điểm hồ sơ. |
| REM-005 | Hiển thị nhắc nhở | Gộp các mục thiếu vào một card nhỏ, không chặn giao diện; chỉ hiển thị tối đa một lần mỗi phiên. |
| REM-006 | Bỏ qua | Cho phép đóng hoặc chọn “Để sau”; không nhắc lại trong cùng phiên, có thể nhắc ở phiên sau nếu vẫn thiếu. |
| REM-007 | Điều hướng bổ sung | Mở đúng phần cập nhật hồ sơ; sau khi cập nhật thành công, mục tương ứng không còn được nhắc ở lần kiểm tra tiếp theo. |

## 3. Quy tắc nghiệp vụ
- **Chỉ nhắc:** số điện thoại chưa xác minh, email chưa xác minh, hoặc chưa có tỉnh/thành phố.
- **Không nhắc:** ảnh đại diện (avatar), username và các trường ngoài phạm vi trên.
- Chỉ áp dụng với người dùng đã đăng nhập; không hiển thị cho khách.
- Mỗi phiên chỉ hiển thị card tối đa một lần; gộp tất cả mục thiếu, không tạo nhiều popup riêng.
- Người dùng có thể bỏ qua mà không bị hạn chế sử dụng Looply; việc bỏ qua không sửa dữ liệu hồ sơ và không cần lưu vĩnh viễn.
- Phiên sau có thể nhắc lại nếu thông tin vẫn thiếu; thông tin đã bổ sung/xác minh thành công không còn được nhắc.
- Cập nhật số điện thoại và email tuân theo luồng xác minh OTP của Auth/User; Reminder chỉ kiểm tra, nhắc và điều hướng, không tự cập nhật hồ sơ.
- Không phát sinh thông báo trong Module Notification; không gửi email, SMS hay push chỉ để nhắc bổ sung hồ sơ.
- Không nhắc liên tục khi chuyển trang. Nếu tính năng khác có điều kiện bắt buộc riêng, tính năng đó tự kiểm tra độc lập với Reminder.

## 4. Luồng tổng quát
1. Người dùng đăng nhập và bắt đầu phiên.
2. Kiểm tra ba thông tin: số điện thoại đã xác minh, email đã xác minh, tỉnh/thành phố.
3. Nếu thiếu, hiển thị một card liệt kê các mục thiếu.
4. Người dùng chọn cập nhật (điều hướng đến User/Auth) hoặc bỏ qua cho phiên hiện tại.
5. Ở lần kiểm tra tiếp theo, chỉ nhắc những mục vẫn còn thiếu.

## 5. Ngoài phạm vi Đồ án 1
Không nhắc avatar; không bắt buộc hoàn thiện toàn bộ hồ sơ; không có chiến dịch nhắc qua email/SMS/push, không có popup chặn thao tác hoặc hệ thống cấu hình lịch nhắc phức tạp.

> **Theo dõi tiến độ:** Xem checklist theo mã chức năng tại [`FUNCTIONAL_REQUIREMENTS.md`](../FUNCTIONAL_REQUIREMENTS.md). File này chỉ mô tả yêu cầu nghiệp vụ, không tự xác nhận trạng thái triển khai.
