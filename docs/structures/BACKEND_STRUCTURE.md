# BACKEND STRUCTURE — Looply (Đồ án 1)

## Mục tiêu
Tổ chức Express.js + TypeScript theo **Modular Monolith**, phân tách trách nhiệm để dễ mở rộng, kiểm thử và bảo trì. Đây là cấu trúc định hướng; chỉ tạo file khi chức năng thực sự cần.

```text
backend/
├── prisma/
│   ├── schema.prisma             # Mô hình dữ liệu Prisma
│   ├── migrations/               # Migration có kiểm soát
│   └── seed.ts                   # Dữ liệu mẫu nếu cần
├── src/
│   ├── app.ts                    # Khởi tạo Express, middleware, mount routes
│   ├── server.ts                 # Khởi chạy HTTP và realtime, shutdown
│   ├── config/                   # Đọc và xác thực cấu hình môi trường
│   ├── shared/
│   │   ├── database/             # Prisma client/adapter, quản lý kết nối
│   │   ├── errors/               # Lỗi ứng dụng và xử lý lỗi chung
│   │   ├── middleware/           # Auth request, validation, error handling
│   │   ├── logger/               # Logging có kiểm soát dữ liệu nhạy cảm
│   │   ├── utils/                # Tiện ích thực sự dùng chung
│   │   └── types/                # Kiểu dùng chung
│   ├── modules/
│   │   ├── auth/
│   │   ├── user/
│   │   ├── listing/
│   │   ├── media/
│   │   ├── chat/                 # Conversation, message, đề xuất giao dịch
│   │   ├── notification/
│   │   └── reminder/             # Chỉ tạo backend logic nếu thực sự cần
│   ├── realtime/                # Socket.IO setup, xác thực, kết nối
│   ├── jobs/                    # Worker/outbox nếu triển khai
│   └── routes/                  # Router tổng hợp hoặc health endpoint
├── tests/                       # Integration/E2E và test helpers
├── .env.example
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Cấu trúc bên trong một module
```text
modules/<module>/
├── <module>.routes.ts            # Khai báo endpoint, middleware
├── <module>.controller.ts        # Nhận request, trả response
├── <module>.service.ts           # Điều phối nghiệp vụ và quy tắc
├── <module>.repository.ts        # Truy cập dữ liệu khi cần
├── <module>.schema.ts            # Zod validation cho đầu vào
├── <module>.types.ts             # Kiểu dữ liệu của module
└── *.spec.ts                     # Unit test gần mã nguồn
```
Không bắt buộc mỗi module phải có đủ mọi file. Với module phức tạp, tách tiếp theo tính năng (`sessions/`, `otp/`, `conversations/`, `messages/`, `proposals/`...), giữ cùng nguyên tắc phân lớp; **không dồn toàn bộ module vào một file lớn**.

## Quy tắc sở hữu và phụ thuộc
- `routes → controller → service → repository`; controller mỏng, nghiệp vụ ở service, repository không chứa quy tắc HTTP.
- Module sở hữu dữ liệu và nghiệp vụ của mình; tương tác module khác qua public service/interface, không truy cập tùy tiện repository nội bộ.
- Auth sở hữu OTP/credential/session; User sở hữu hồ sơ/follow/block; Listing sở hữu bài đăng/trạng thái; Chat sở hữu hội thoại/tin nhắn/đề xuất; Media sở hữu xử lý tệp; Notification sở hữu thông báo.
- `shared/` chỉ chứa thành phần dùng chung thật sự, không trở thành nơi chứa nghiệp vụ của mọi module.
- Middleware xác thực không thay thế kiểm tra quyền sở hữu tài nguyên ở service.
- Tách side effect (SMS, email, storage, socket) sau interface phù hợp để dễ mock/test; không ghi log mật khẩu, OTP, token.
- API, database schema và cấu trúc thực tế phải khớp yêu cầu đã duyệt; thay đổi migration phải an toàn cho dữ liệu.
- Unit test đặt cạnh module; integration test sử dụng database **riêng** và không chạy thao tác phá hủy trên database dev/prod.
