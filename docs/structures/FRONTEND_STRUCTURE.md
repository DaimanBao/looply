# FRONTEND STRUCTURE — Looply (Đồ án 1)

## Mục tiêu
Tổ chức Angular 21 + TypeScript theo **feature-first**, tách giao diện, trạng thái, gọi API và quy tắc hiển thị. Chỉ tạo các file/thư mục thực sự cần.

```text
frontend/
├── src/
│   ├── app/
│   │   ├── app.config.ts          # Providers, HTTP, router
│   │   ├── app.routes.ts          # Route cấp ứng dụng và lazy loading
│   │   ├── core/
│   │   │   ├── auth/              # Session phía client, guard/interceptor
│   │   │   ├── http/              # API config, lỗi HTTP chung
│   │   │   ├── realtime/          # Socket.IO client và vòng đời kết nối
│   │   │   └── layout/            # Shell, header, navigation
│   │   ├── shared/
│   │   │   ├── ui/                # Component tái sử dụng không chứa nghiệp vụ
│   │   │   ├── directives/
│   │   │   ├── pipes/
│   │   │   └── utils/
│   │   └── features/
│   │       ├── auth/
│   │       ├── user/
│   │       ├── listing/
│   │       ├── media/
│   │       ├── chat/             # Bao gồm card/đề xuất giao dịch
│   │       ├── notification/
│   │       └── reminder/
│   ├── assets/                   # Tài nguyên tĩnh
│   ├── environments/             # Cấu hình không chứa bí mật
│   └── styles.scss               # Style toàn cục, design tokens
├── e2e/                          # Playwright khi triển khai
├── package.json
└── angular.json
```

## Cấu trúc feature mẫu
```text
features/<feature>/
├── pages/                        # Trang gắn route
├── components/                   # UI thuộc feature
├── data-access/                  # HTTP client, DTO, adapter
├── state/                        # Signals/service quản lý trạng thái
├── models/                       # Kiểu và view model của feature
├── <feature>.routes.ts           # Route lazy-loaded nếu cần
└── *.spec.ts                     # Test đặt gần mã nguồn
```
Không tạo mọi thư mục nếu chưa sử dụng. Feature lớn có thể chia theo use case; tránh component/service khổng lồ.

## Auth/User hiện tại

- `core/auth/`: session Signals trong RAM, cookie refresh single-flight, interceptor và lifecycle guards; không chứa form giao diện. `core/http/` giữ API prefix, DTO contract và lỗi công khai.
- `features/auth/`: API client, các trang đăng nhập/đăng ký/khôi phục và controls OTP/re-auth. `public-api.ts` là entry cho các form User tái sử dụng xác minh của Auth.
- `features/user/`: API client, owner profile store, avatar và các trang profile/contact/password/session/username/Follow/Block/deletion. `public-api.ts` cho Auth đọc catalog Province của User, không import các page hoặc state nội bộ.
- `shared/ui/` chỉ giữ feedback/loading của thao tác, `shared/validation/` giữ validators form; không thực thi quyền sở hữu, liên kết hay trạng thái xóa ở shared.
- Routes lazy-load từng page. Avatar tải bytes bằng HTTP stack rồi dùng Blob URL tạm, không dùng URL ảnh bỏ qua Bearer/Block. Các trang Profile/list phản ứng khi route đổi User ID và bỏ phản hồi cũ.
- Project đang client-rendered, không bật SSR. Chi tiết cấu hình, test và mức nghiệm thu thuộc [Frontend README](../../frontend/README.md); các thư mục tương lai trong sơ đồ trên chưa được tạo nếu chưa có trách nhiệm thực tế.

## Quy tắc
- **Page** điều phối hiển thị; **component** tập trung UI; **data-access** gọi API; **state** quản lý trạng thái; không nhúng gọi HTTP và nghiệp vụ phức tạp trực tiếp trong template/component.
- Dùng Angular Signals cho trạng thái UI phù hợp, RxJS cho luồng bất đồng bộ; không tạo nhiều nguồn sự thật cho cùng một session/dữ liệu.
- `core/` dành cho singleton và hạ tầng ứng dụng; `shared/` chỉ dành cho UI/utility tái sử dụng, không chứa logic riêng của feature.
- Các feature không import trực tiếp thành phần nội bộ của nhau tùy tiện; dùng public interface hoặc service chung được thiết kế rõ.
- Route có thể lazy-load; guard hỗ trợ trải nghiệm nhưng **backend luôn quyết định quyền truy cập**.
- Không chứa secrets trong frontend; dữ liệu từ API phải được xử lý lỗi, loading, empty state; hỗ trợ SSR an toàn khi dự án bật SSR.
- Viết unit/component tests và E2E cho luồng quan trọng; chỉ cập nhật checklist chức năng sau khi kết quả được xác minh.
