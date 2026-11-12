# ROOT STRUCTURE — Looply (Đồ án 1)

## Mục tiêu
Quy định trách nhiệm các thư mục cấp repository; cấu trúc chi tiết xem `BACKEND_STRUCTURE.md` và `FRONTEND_STRUCTURE.md`.

```text
looply/
├── AGENTS.md                  # Quy tắc chung cho AI Agent
├── README.md                  # Giới thiệu và hướng dẫn chạy dự án
├── .github/                   # CI, mẫu issue/PR và hướng dẫn agent (nếu dùng)
├── docs/
│   ├── PROJECT_OVERVIEW.md
│   ├── DOCUMENTATION_GUIDE.md
│   ├── TECH_STACK.md
│   ├── README.md
│   ├── database/                    # Thiết kế dữ liệu Prisma 7 và SQL tham khảo
│   ├── requirements/
│   │   ├── README.md
│   │   ├── FUNCTIONAL_REQUIREMENTS.md  # Checklist tiến độ toàn dự án
│   │   └── modules/                    # Đặc tả nghiệp vụ theo module
│   ├── structures/                     # README và quy tắc cấu trúc repository/BE/FE
│   └── workflows/                      # README, DEVELOPMENT_WORKFLOW và 6 giai đoạn
├── backend/                   # Express + TypeScript, Prisma, API, realtime
├── frontend/                  # Angular + TypeScript, UI
├── compose.yaml               # Dịch vụ chạy bằng Docker khi cần
├── .gitignore
└── .env.example               # Mẫu biến môi trường, không chứa bí mật
```

## Quy tắc
- Mỗi phần chỉ có một nơi sở hữu: nghiệp vụ ở `docs/requirements/modules/`, tiến độ ở `docs/requirements/FUNCTIONAL_REQUIREMENTS.md`, quy trình ở `docs/workflows/`.
- Backend và frontend có cấu hình, dependencies, tests và README/hướng dẫn riêng khi cần; không đặt logic ứng dụng ở thư mục gốc.
- Không commit `.env`, token, khóa, tệp upload, thư mục build hoặc dữ liệu PostgreSQL.
- Chỉ thêm thư mục/công cụ khi có nhu cầu thực tế; không tự mở rộng phạm vi Đồ án 2.
- Khi hoàn thành chức năng và kiểm thử đạt, cập nhật checklist tổng thể theo `docs/workflows/DEVELOPMENT_WORKFLOW.md`.
