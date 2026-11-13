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
├── public-api.ts                 # Chỉ export giao diện cần dùng ngoài feature
└── *.spec.ts                     # Test đặt gần mã nguồn
```
Không tạo mọi thư mục nếu chưa sử dụng. Feature lớn có thể chia theo use case; tránh component/service khổng lồ.

## Quy ước Page và Component

Áp dụng feature-based và Angular Standalone Components cho phần phát triển mới, bao gồm Listing UI. Ví dụ một trang trong `features/user/`:

```text
features/user/
├── components/                   # Component tái sử dụng trong User
├── data-access/                  # API clients và adapter
├── pages/
│   ├── contacts.page.ts          # Logic và trạng thái giao diện
│   ├── contacts.page.html        # Angular template
│   ├── contacts.page.scss        # Chỉ tạo khi có style riêng
│   └── contacts.page.spec.ts     # Unit/component tests
├── state/                        # Shared state/store khi thực sự cần
└── public-api.ts                 # Giao diện công khai của feature
```

Đây là ví dụ quy ước, không phải khẳng định các file đã tồn tại. Không tạo thư mục hoặc file rỗng để khớp sơ đồ.

- **Bắt buộc:** Page có giao diện dùng `templateUrl` trỏ tới file `.page.html` riêng; TypeScript không chứa template HTML dài.
- Component có template đáng kể dùng file HTML riêng. Template có nhiều nhánh điều kiện, vòng lặp, form hoặc nhiều vùng giao diện nên được xem là đáng kể; component nhỏ, đơn giản được phép inline template.
- Style riêng dùng SCSS khi cần; không bắt buộc tạo SCSS rỗng. Test đặt cạnh Page/component cùng tên với hậu tố `.spec.ts`.
- Page giữ logic và trạng thái UI cục bộ, điều phối tương tác và gọi service/store. Không dồn business logic vào Page; business logic phía client thuộc service của feature, còn bất biến và phân quyền vẫn do Backend thực thi.
- HTTP/API calls thuộc `data-access/` hoặc service phù hợp; không gọi HTTP trực tiếp trong Page/component. Shared state thuộc `state/` khi có nhu cầu chia sẻ thực tế; không đẩy mọi trạng thái cục bộ vào store.
- Component tái sử dụng trong feature thuộc `components/`; UI thực sự dùng chung và không chứa nghiệp vụ riêng thuộc `shared/ui/`. Tái sử dụng giữa feature qua `public-api.ts`, không export toàn bộ nội bộ hoặc tạo phụ thuộc vòng.
- Không tạo abstraction, wrapper hoặc chia file quá mức; mỗi file/tầng phải có trách nhiệm thực tế.

## Thực hành Angular 21

- Dùng Standalone Components; ưu tiên `inject()` cho dependency injection và TypeScript strict typing, bao gồm strict template checking. Kiểm tra dữ liệu không đáng tin cậy ở ranh giới API.
- Ưu tiên Signals cho reactive UI state và `computed` cho giá trị dẫn xuất; tránh giữ bản sao trạng thái có thể tính được. RxJS phù hợp cho asynchronous streams, hủy request và phối hợp sự kiện; quản lý vòng đời subscription.
- Dùng Reactive Forms cho form phức tạp. Không tự chuyển sang Signal Forms hoặc API mới chỉ vì API đó tồn tại; không thêm thư viện state management.
- Ưu tiên built-in control flow `@if`, `@for`; chọn khóa `track` ổn định theo định danh dữ liệu.
- Lazy loading ở feature routes khi phù hợp (`loadChildren` cho nhóm route hoặc `loadComponent` cho Page); không cần tạo route trung gian nếu không có nhu cầu.
- Viết code SSR-safe dù ứng dụng hiện client-rendered: không truy cập `window`, `document`, browser storage hoặc browser-only API vô điều kiện lúc khởi tạo/import; dùng platform guard hoặc lifecycle phù hợp khi cần. Quy ước này không bật SSR và không thay quyết định triển khai trong [Tech Stack](../TECH_STACK.md).
- Bảo đảm accessibility: HTML có ngữ nghĩa, label cho form, thao tác bàn phím, quản lý focus và thông báo lỗi/loading phù hợp; dùng ARIA khi HTML mặc định chưa đủ.
- Viết unit/component tests cho hành vi và trạng thái quan trọng; E2E cho luồng người dùng quan trọng theo [Testing Workflow](../workflows/TESTING.md). Không coi mock là bằng chứng tích hợp thật.

## Angular CLI và phạm vi áp dụng

`frontend/angular.json` hiện đặt component style là `scss`. Schema component của Angular CLI 21 đang cài có defaults `standalone: true`, `inlineTemplate: false`, `skipTests: false`; không cần thay cấu hình để sinh standalone component với HTML và test riêng.

Ví dụ chạy tại `frontend/` khi phát triển một Page mới (tên minh họa, không chạy để tạo lại Page hiện có):

```powershell
ng generate component features/user/pages/example --type=page --flat --style=none --dry-run
```

Lệnh dry-run cho phép kiểm tra tên `.page.ts`, `.page.html`, `.page.spec.ts` trước khi tạo; bỏ `--dry-run` khi thực sự triển khai. Dùng `--style=scss` nếu có style riêng. Component nhỏ có thể chọn `--inline-template` khi đáp ứng quy tắc ở trên.

Các quy ước này không yêu cầu refactor hàng loạt Auth/User hiện tại. Một số Page cũ còn inline template; việc tách chúng cần nhiệm vụ riêng được phê duyệt. Không tạo HTML/SCSS hàng loạt, không thay API, dependency hay hành vi hiện tại trong nhiệm vụ chuẩn hóa tài liệu.

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
