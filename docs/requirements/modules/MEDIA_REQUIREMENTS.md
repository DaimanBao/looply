# MEDIA REQUIREMENTS — Looply (Đồ án 1)

## 1. Phạm vi
Module Media quản lý ảnh và video gắn với Listing: tải lên, xem trước, hiển thị, sắp xếp, thay thế, kiểm tra và xử lý lỗi; đồng thời cung cấp xử lý ảnh dùng chung cho avatar và ảnh tin nhắn theo giới hạn của module sở hữu. Quyền sở hữu, trạng thái và quy trình chỉnh sửa Listing do Module Listing quy định. Tài liệu mô tả yêu cầu nghiệp vụ, chưa ấn định API, cơ sở dữ liệu, thư viện hay nhà cung cấp lưu trữ.

## 2. Danh sách chức năng

| Mã | Chức năng | Yêu cầu |
|---|---|---|
| MEDIA-001 | Tải ảnh lên | Chọn và tải trực tiếp 1–5 ảnh/Listing; tối đa 10 MB/ảnh; JPG/JPEG, PNG, WebP. |
| MEDIA-002 | Tải video lên | Video tùy chọn, tối đa 1 video/Listing; MP4 hoặc WebM; tối đa 100 MB và 3 phút. |
| MEDIA-003 | Xóa Media | Chủ Listing được xóa ảnh/video; khi lưu Listing vẫn phải còn ít nhất 1 ảnh; dọn dẹp tệp không còn sử dụng phù hợp. |
| MEDIA-004 | Thay thế Media | Cho phép thay ảnh/video; kiểm tra tệp mới; chỉ bỏ Media cũ sau khi thay thế thành công. |
| MEDIA-005 | Xem trước Media | Preview trước khi lưu; có thể bỏ, thay thế, sắp xếp và chọn ảnh đại diện; hủy chỉnh sửa không ảnh hưởng dữ liệu đã lưu. |
| MEDIA-006 | Xem Media | Feed dùng thumbnail; trang chi tiết dùng ảnh chất lượng cao hơn; giữ tỷ lệ ảnh; video chỉ phát theo thao tác người dùng, không tự phát trên Feed. |
| MEDIA-007 | Chọn ảnh đại diện | Mỗi Listing có 1 ảnh đại diện; có thể chọn bất kỳ ảnh nào; mặc định ảnh đầu tiên; khi xóa ảnh đại diện, chọn ảnh đầu tiên còn lại. |
| MEDIA-008 | Sắp xếp ảnh | Cho phép đổi và lưu thứ tự ảnh; ảnh đại diện độc lập với thứ tự hiển thị. |
| MEDIA-009 | Kiểm tra Media | Frontend kiểm tra sơ bộ, Backend xác thực lại số lượng, định dạng thực, dung lượng và thời lượng; không chỉ tin phần mở rộng; tối ưu ảnh và tạo thumbnail; không yêu cầu chuyển mã video phức tạp. |
| MEDIA-010 | Xử lý Media lỗi | Hiển thị tiến trình, thông báo lỗi rõ ràng, cho phép thử lại; không lưu tham chiếu upload lỗi; bảo toàn Media cũ khi thay thế thất bại; dọn dẹp tệp tạm/tệp mồ côi. |

## 3. Quy tắc chung

- **Ảnh:** Bắt buộc ít nhất 1 và tối đa 5 ảnh hợp lệ trên mỗi Listing; mỗi ảnh tối đa 10 MB. Hỗ trợ JPG/JPEG, PNG, WebP; chưa hỗ trợ GIF và HEIC/HEIF trực tiếp.
- **Video:** Không bắt buộc; tối đa 1 video, 100 MB và 3 phút; hỗ trợ MP4, WebM.
- **Tối ưu:** Tự động tối ưu/nén ảnh, tạo thumbnail phục vụ Feed; giữ đúng tỷ lệ, không làm méo. Video hợp lệ không bắt buộc chuyển mã; không tự động phát khi cuộn Feed.
- **Tính toàn vẹn:** Không tạo/lưu Listing mới khi chưa có ảnh tải lên hợp lệ. Khi chỉnh sửa, không được lưu trạng thái không còn ảnh nào. Không xóa Media cũ trước khi thay thế thành công.
- **Kiểm tra:** Backend phải kiểm tra độc lập với Frontend và từ chối tệp không hợp lệ; thông báo nguyên nhân để người dùng sửa hoặc thử lại.

## 4. Quy trình nghiệp vụ

1. Người dùng chọn ảnh/video từ thiết bị.
2. Frontend kiểm tra sơ bộ và hiển thị preview.
3. Người dùng thêm/xóa/thay thế, sắp xếp ảnh và chọn ảnh đại diện.
4. Khi lưu, hệ thống upload và hiển thị tiến trình; Backend xác thực lại Media.
5. Ảnh hợp lệ được tối ưu và tạo thumbnail; lưu tham chiếu Media hợp lệ với Listing.
6. Nếu thất bại, thông báo lỗi, cho phép thử lại và tránh để lại tham chiếu hoặc tệp không sử dụng.

## 5. Phân quyền và liên kết module

- Chỉ chủ Listing đã đăng nhập được thêm, xóa, thay thế, sắp xếp Media và chọn ảnh đại diện của bài mình.
- Khách chưa đăng nhập được xem Media của Listing công khai.
- Listing chuyển `HIDDEN` không làm xóa Media. Listing chuyển `DELETED` không hiển thị Media công khai; dữ liệu cần thiết cho lịch sử Conversation được giữ theo quy tắc lưu trữ.
- Khi Listing đã có Conversation, thao tác chỉnh sửa Media tuân theo cảnh báo, xác nhận và thông báo của Module Listing.
- Conversation cũ có thể hiển thị thông tin Media tóm tắt của Listing; quy tắc card thuộc Module Chat.

## 6. Ngoài phạm vi Đồ án 1

Không triển khai hệ thống quản lý tệp độc lập, GIF/HEIC trực tiếp, tự phát video trên Feed hoặc pipeline chuyển mã video phức tạp. Chi tiết lưu trữ và thư viện xử lý tuân theo `../../TECH_STACK.md`; không tự bổ sung nhà cung cấp mới.

> **Theo dõi tiến độ:** Xem checklist theo mã chức năng tại [`FUNCTIONAL_REQUIREMENTS.md`](../FUNCTIONAL_REQUIREMENTS.md). File này chỉ mô tả yêu cầu nghiệp vụ, không tự xác nhận trạng thái triển khai.
