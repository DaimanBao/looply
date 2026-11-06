# Backend Packages -- Looply

> **Mục đích tài liệu:** Đây là tài liệu tham chiếu dành cho AI Agent và
> lập trình viên khi làm việc trong Backend của Looply. Tài liệu ghi
> nhận các package hiện có trong `backend/package.json`, giải thích vai
> trò, phạm vi sử dụng, module liên quan và các nguyên tắc cần tuân thủ.
>
> **Nguồn ghi nhận:** `backend/package.json` do nhóm phát triển cung
> cấp.
>
> **Phạm vi:** Backend -- Express.js + TypeScript + PostgreSQL + Prisma.
>
> **Lưu ý quan trọng:** Danh sách dưới đây phản ánh package được khai
> báo trong `package.json`. Việc một package đã được cài không có nghĩa
> là mọi chức năng của nó đã được triển khai hoặc cấu hình hoàn chỉnh
> trong source code.

------------------------------------------------------------------------

## 1. Thông tin môi trường Backend

  Thành phần                       Giá trị
  -------------------------------- ---------------------------------
  Tên package                      `backend`
  Phiên bản project                `1.0.0`
  Runtime                          Node.js
  Ngôn ngữ                         TypeScript
  Backend framework                Express.js 5
  Database                         PostgreSQL
  ORM                              Prisma 7
  Module type                      CommonJS (`"type": "commonjs"`)
  Entry point khi phát triển       `src/server.ts`
  Entry point khi chạy bản build   `dist/server.js`
  Development runner               `tsx`
  Compiler                         TypeScript (`tsc`)

### 1.1. Scripts hiện có

  ---------------------------------------------------------------------------------------------
  Script                  Lệnh                                          Mục đích
  ----------------------- --------------------------------------------- -----------------------
  `dev`                   `tsx watch src/server.ts`                     Chạy Backend trong môi
                                                                        trường phát triển và tự
                                                                        khởi động lại khi
                                                                        source thay đổi.

  `build`                 `tsc`                                         Biên dịch TypeScript
                                                                        theo cấu hình
                                                                        `tsconfig.json`.

  `start`                 `node dist/server.js`                         Chạy phiên bản
                                                                        JavaScript đã build.

  `test`                  `echo "Error: no test specified" && exit 1`   Hiện vẫn là script mặc
                                                                        định, chưa được thay
                                                                        bằng lệnh chạy Vitest.

  `postinstall`           `prisma skills sync \|\| exit 0`              Chạy lệnh đồng bộ
                                                                        Prisma skills sau khi
                                                                        cài dependency; nếu
                                                                        lệnh thất bại thì không
                                                                        làm thất bại toàn bộ
                                                                        quá trình cài package.
  ---------------------------------------------------------------------------------------------

**Việc cần làm khi thiết lập Testing:** cập nhật script `test` để chạy
Vitest và bổ sung các script liên quan khi cấu hình test thực tế. Không
được coi script `test` hiện tại là đã chạy kiểm thử.

------------------------------------------------------------------------

## 2. Phân biệt dependencies và devDependencies

Backend hiện chia package thành hai nhóm:

-   **`dependencies`:** Các package cần có khi ứng dụng Backend chạy. Ví
    dụ: Express, Prisma Client, Argon2, Socket.IO.
-   **`devDependencies`:** Các package phục vụ phát triển, biên dịch,
    kiểm thử hoặc hỗ trợ lập trình. Ví dụ: TypeScript, tsx, Vitest,
    Supertest và các package khai báo kiểu.

Không chuyển package giữa hai nhóm chỉ vì thấy package đó được dùng
trong source code. Cần căn cứ vào việc package có cần thiết trong môi
trường chạy ứng dụng hay chỉ phục vụ quy trình phát triển/build/test.

------------------------------------------------------------------------

# 3. Runtime dependencies

Các package trong phần này hiện được khai báo tại `dependencies`.

## 3.1. Express và nền tảng HTTP

### `express` -- `^5.3.0`

**Vai trò:** Framework HTTP chính của Backend.

**Sử dụng ở đâu:** - Khởi tạo ứng dụng Express. - Khai báo REST API. -
Định nghĩa route và middleware. - Tiếp nhận request, gọi tầng xử lý
nghiệp vụ và trả response. - Kết nối các module Backend.

**Module liên quan:** Toàn bộ Backend, bao gồm `auth`, `user`,
`listing`, `media`, `chat`, `notification` và các module khác.

**Nguyên tắc sử dụng:** - Route nên tập trung vào định tuyến và kết nối
middleware/controller. - Không nhồi toàn bộ nghiệp vụ vào route
handler. - Xử lý lỗi tập trung bằng Express error-handling middleware. -
Các thao tác cần xác thực và phân quyền phải được bảo vệ ở Backend,
không chỉ dựa vào giao diện Frontend. - Khi sử dụng Express 5, cần viết
middleware và xử lý lỗi phù hợp với cơ chế của phiên bản 5.

### `express-rate-limit` -- `^8.7.3`

**Vai trò:** Giới hạn tần suất request từ một nguồn trong một khoảng
thời gian.

**Sử dụng ở đâu:** - Các endpoint đăng nhập. - Đăng ký hoặc các endpoint
nhạy cảm. - Gửi yêu cầu OTP SMS/email. - Xác minh OTP. - Những endpoint
khác có nguy cơ bị spam hoặc brute-force.

**Module liên quan:** Chủ yếu `auth`; có thể áp dụng cho endpoint nhạy
cảm ở module khác nếu có lý do.

**Nguyên tắc sử dụng:** - Không áp dụng một giới hạn quá chặt cho toàn
bộ API một cách máy móc. - Thiết kế giới hạn phù hợp với từng nhóm
endpoint. - Không coi rate limiting là cơ chế thay thế xác thực, phân
quyền hoặc kiểm tra nghiệp vụ. - Khi triển khai nhiều instance Backend,
cần xem xét cấu hình storage dùng chung; cấu hình mặc định trong bộ nhớ
có giới hạn khi chạy nhiều instance.

------------------------------------------------------------------------

## 3.2. Database và Prisma ORM

### `pg` -- `^8.23.1`

**Vai trò:** PostgreSQL driver cho Node.js.

**Sử dụng ở đâu:** - Cung cấp kết nối PostgreSQL ở tầng Node.js. - Được
Prisma PostgreSQL adapter sử dụng để giao tiếp với PostgreSQL.

**Module liên quan:** Tầng database/infrastructure dùng chung toàn
Backend.

**Nguyên tắc sử dụng:** - Trong kiến trúc hiện tại, các truy vấn nghiệp
vụ thông thường nên đi qua Prisma Client. - Không tự ý tạo thêm một cơ
chế truy vấn PostgreSQL độc lập bằng `pg` nếu không có nhu cầu kỹ thuật
rõ ràng. - Quản lý vòng đời kết nối/pool theo cấu hình database của ứng
dụng.

### `@prisma/client` -- `^7.10.1`

**Vai trò:** Prisma Client được ứng dụng sử dụng để truy vấn và thao tác
dữ liệu.

**Sử dụng ở đâu:** - Truy vấn, tạo, cập nhật và xóa dữ liệu
PostgreSQL. - Thực hiện transaction. - Truy vấn quan hệ giữa các
model. - Thực hiện các thao tác dữ liệu của từng module.

**Module liên quan:** Tất cả module có truy cập database.

**Nguyên tắc sử dụng:** - Ưu tiên Prisma Client thay vì tự viết SQL cho
các thao tác CRUD thông thường. - Dùng transaction khi nhiều thao tác dữ
liệu phải thành công hoặc thất bại cùng nhau. - Không để Frontend truy
cập database trực tiếp. - Không đưa logic nghiệp vụ phức tạp vào route
chỉ để thực hiện truy vấn. - Kiểm tra quyền sở hữu tài nguyên ở Backend
trước khi cho phép cập nhật hoặc xóa. - Không trả dữ liệu nhạy cảm của
tài khoản ra response.

### `@prisma/adapter-pg` -- `^7.10.1`

**Vai trò:** Adapter kết nối Prisma với PostgreSQL thông qua driver
`pg`.

**Sử dụng ở đâu:** - Tầng khởi tạo Prisma/database. - Dùng khi cấu hình
Prisma Client theo kiến trúc driver adapter của Prisma 7.

**Module liên quan:** Database/infrastructure dùng chung.

**Nguyên tắc sử dụng:** - Cấu hình adapter và Prisma Client tại một vị
trí tập trung. - Không tạo nhiều Prisma Client không cần thiết. - Không
để từng module tự khởi tạo một kết nối database riêng. - Giữ phiên bản
tương thích giữa `prisma`, `@prisma/client` và `@prisma/adapter-pg`.

### `prisma` -- `^7.10.1` -- devDependency

**Vai trò:** Prisma CLI phục vụ phát triển và quản lý schema/database.

**Sử dụng ở đâu:** - Quản lý Prisma schema. - Tạo và chạy migration. -
Sinh Prisma Client. - Các lệnh kiểm tra và thao tác phát triển liên quan
đến Prisma.

**Module liên quan:** Database/infrastructure và quy trình phát triển
Backend.

**Nguyên tắc sử dụng:** - Phân biệt Prisma CLI (`prisma`) với Prisma
Client (`@prisma/client`). - CLI chủ yếu phục vụ quy trình phát
triển/build; ứng dụng runtime sử dụng Prisma Client. - Không tự ý thay
đổi phiên bản Prisma sang major khác. - Khi thay đổi schema, cần xem xét
migration và cập nhật tài liệu database tương ứng.

------------------------------------------------------------------------

## 3.3. Biến môi trường

### `dotenv` -- `^18.0.9`

**Vai trò:** Đọc biến môi trường từ file `.env` vào `process.env`.

**Sử dụng ở đâu:** - Điểm khởi tạo ứng dụng hoặc cấu hình môi trường. -
Các cấu hình như database URL, port, secret, cấu hình dịch vụ ngoài.

**Module liên quan:** Cấu hình dùng chung toàn Backend.

**Nguyên tắc sử dụng:** - Nạp biến môi trường sớm, trước khi các module
cần đọc chúng. - Không hard-code secret, password hoặc API key trong
source code. - Không commit file `.env` chứa thông tin bí mật. - Có thể
dùng file mẫu như `.env.example` với giá trị minh họa, không chứa secret
thật. - Nên kiểm tra sự tồn tại và định dạng của biến môi trường khi ứng
dụng khởi động.

------------------------------------------------------------------------

## 3.4. Authentication và bảo mật tài khoản

### `argon2` -- `^0.45.2`

**Vai trò:** Hash và xác minh mật khẩu.

**Sử dụng ở đâu:** - Khi người dùng đăng ký tài khoản bằng mật khẩu. -
Khi người dùng đổi mật khẩu. - Khi xác minh mật khẩu lúc đăng nhập.

**Module liên quan:** `auth`.

**Nguyên tắc sử dụng:** - Không lưu mật khẩu dạng văn bản thuần
(plaintext). - Dùng hàm hash để tạo password hash và hàm verify để kiểm
tra mật khẩu. - Không tự thiết kế thuật toán hash mật khẩu. - Không ghi
password hoặc password hash vào log hay response API. - Argon2 dùng cho
mật khẩu; không dùng nó thay cho JWT hoặc OTP.

### `jose` -- `^6.2.15`

**Vai trò:** Làm việc với JSON Web Token (JWT) và các chuẩn JOSE.

**Sử dụng ở đâu:** - Tạo token xác thực sau khi đăng nhập thành công. -
Xác minh token trong middleware xác thực. - Đọc claims cần thiết để xác
định danh tính và thời hạn token.

**Module liên quan:** `auth`; middleware xác thực dùng chung cho các
module cần bảo vệ.

**Nguyên tắc sử dụng:** - Backend phải xác minh chữ ký, thời hạn và các
claims cần thiết của token. - Không chỉ giải mã token rồi mặc định token
hợp lệ. - Không đưa password, OTP hoặc dữ liệu bí mật vào payload. -
Secret/private key phải được quản lý qua biến môi trường hoặc hệ thống
quản lý secret phù hợp. - JWT xác thực danh tính không tự động đồng
nghĩa với việc người dùng được quyền thao tác trên mọi tài nguyên; vẫn
phải kiểm tra authorization và quyền sở hữu.

### `google-auth-library` -- `^11.3.3`

**Vai trò:** Tích hợp và xác minh danh tính Google.

**Sử dụng ở đâu:** - Luồng đăng nhập bằng Google. - Backend xác minh
Google ID token nhận được từ Frontend. - Đọc thông tin danh tính đã được
Google xác minh để xử lý đăng nhập/tài khoản.

**Module liên quan:** `auth`.

**Nguyên tắc sử dụng:** - Backend phải xác minh token với thư viện,
không tin dữ liệu profile do Frontend tự gửi. - Kiểm tra audience/client
ID và các thông tin cần thiết theo cấu hình Google OAuth. - Phân biệt
tài khoản đăng nhập bằng Google với tài khoản nội bộ dùng
username/password theo nghiệp vụ Looply đã xác nhận. - Không tự động
biến email Google thành tài khoản mật khẩu nội bộ nếu chưa có quy trình
liên kết tài khoản được thiết kế rõ ràng.

------------------------------------------------------------------------

## 3.5. Validation

### `zod` -- `^4.6.7`

**Vai trò:** Khai báo schema và kiểm tra dữ liệu.

**Sử dụng ở đâu:** - Kiểm tra request body, query parameters và route
parameters. - Kiểm tra dữ liệu đăng ký, đăng nhập, OTP, hồ sơ người
dùng. - Kiểm tra dữ liệu tạo/sửa listing. - Kiểm tra dữ liệu gửi tin
nhắn và các thao tác nghiệp vụ khác. - Kiểm tra cấu hình môi trường khi
khởi động nếu cần.

**Module liên quan:** Tất cả module nhận dữ liệu đầu vào.

**Nguyên tắc sử dụng:** - Backend luôn phải validation, kể cả khi
Frontend đã kiểm tra. - Tạo schema phù hợp với từng loại dữ
liệu/request. - Chuẩn hóa cách trả lỗi validation để Frontend có thể
hiển thị lỗi đúng trường. - Không xem validation là biện pháp thay thế
authorization hoặc kiểm tra nghiệp vụ. - Không giả định dữ liệu gửi từ
Frontend là đáng tin cậy. - Không tạo schema quá tổng quát khiến nhiều
nghiệp vụ khác nhau vô tình dùng chung quy tắc không phù hợp.

**Ghi chú:** Frontend Angular có thể triển khai validation riêng. Việc
chia sẻ schema Zod giữa Frontend và Backend chỉ nên thực hiện nếu cấu
trúc monorepo và cách tổ chức code được thiết kế phù hợp; không được
import tùy tiện code Backend vào Frontend.

------------------------------------------------------------------------

## 3.6. Upload và xử lý media

### `multer` -- `^2.5.0`

**Vai trò:** Middleware xử lý file upload theo `multipart/form-data`
trong Express.

**Sử dụng ở đâu:** - Upload ảnh đại diện. - Upload ảnh listing. - Upload
video listing nếu luồng upload hiện tại dùng multipart request.

**Module liên quan:** `media`, được sử dụng bởi `user` và `listing` khi
cần upload.

**Nguyên tắc sử dụng:** - Kiểm tra loại file, kích thước file và số
lượng file ở Backend. - Không chỉ dựa vào phần mở rộng tên file do người
dùng cung cấp. - Không tin MIME type do client gửi mà không kiểm tra
thêm. - Giới hạn kích thước và số lượng upload theo nghiệp vụ. - Xử lý
file tạm và dọn dẹp khi upload hoặc xử lý thất bại. - Không để người
dùng tự quyết định đường dẫn lưu file trên server. - Không để file
upload ghi đè file của người dùng khác.

### `sharp` -- `^0.35.5`

**Vai trò:** Xử lý và tối ưu ảnh.

**Sử dụng ở đâu:** - Nén/tối ưu ảnh listing. - Tối ưu ảnh đại diện. -
Resize ảnh theo kích thước phù hợp. - Chuyển đổi định dạng ảnh khi cần.

**Module liên quan:** `media`.

**Nguyên tắc sử dụng:** - Chỉ dùng Sharp cho xử lý ảnh; không coi Sharp
là công cụ xử lý video. - Giới hạn kích thước ảnh đầu vào và kiểm soát
tài nguyên khi xử lý. - Giữ nguyên file gốc chỉ khi nghiệp vụ thực sự
cần. - Xử lý lỗi khi file ảnh không hợp lệ hoặc không thể giải mã. -
Không tin metadata do client tự khai báo.

**Ghi chú media:** Multer tiếp nhận file; Sharp xử lý ảnh. Hai package
có vai trò khác nhau và thường phối hợp trong luồng upload ảnh.

------------------------------------------------------------------------

## 3.7. Realtime communication

### `socket.io` -- `^4.8.4`

**Vai trò:** Giao tiếp hai chiều thời gian thực giữa Backend và các
client kết nối.

**Sử dụng ở đâu:** - Gửi và nhận tin nhắn realtime. - Cập nhật số lượng
thông báo chưa đọc. - Phát thông báo trong ứng dụng khi có sự kiện liên
quan. - Đồng bộ các sự kiện realtime khác đã được nghiệp vụ xác nhận.

**Module liên quan:** `chat`, `notification`; có thể được các module
khác phát sự kiện thông qua cơ chế tích hợp được thiết kế rõ ràng.

**Nguyên tắc sử dụng:** - Xác thực kết nối Socket.IO ở Backend. - Kiểm
tra quyền truy cập conversation trước khi cho client tham gia room hoặc
nhận dữ liệu. - Không gửi nội dung hoặc sự kiện cho người không có
quyền. - Database vẫn là nơi lưu dữ liệu chính; Socket.IO chỉ đảm nhiệm
truyền sự kiện realtime. - Không xem việc gửi sự kiện Socket.IO là thay
thế cho việc lưu message/notification thành công trong database. - Xử lý
reconnect và các tình huống client mất kết nối. - Đồ án 1 hiện chưa cần
Redis Adapter khi chỉ triển khai một Backend instance; xem xét lại nếu
mở rộng nhiều instance.

**Phía Frontend:** Angular cần thư viện client tương ứng
(`socket.io-client`) khi triển khai kết nối. Package đó thuộc
`frontend`, không nằm trong danh sách Backend này.

------------------------------------------------------------------------

## 3.8. Logging

### `pino` -- `^10.4.0`

**Vai trò:** Thư viện logging có cấu trúc cho Node.js.

**Sử dụng ở đâu:** - Ghi nhận lỗi Backend. - Ghi nhận các sự kiện vận
hành cần thiết. - Ghi nhận thông tin phục vụ debug và theo dõi hệ
thống. - Cung cấp logger dùng chung cho các module.

**Module liên quan:** Toàn Backend; nên đặt logger ở tầng
shared/infrastructure thay vì mỗi module tự tạo một logger độc lập.

**Nguyên tắc sử dụng:** - Dùng các mức log phù hợp như `info`, `warn`,
`error`, `debug`. - Không ghi password, OTP, token, secret hoặc dữ liệu
nhạy cảm. - Không ghi toàn bộ request body một cách mặc định vì có thể
chứa thông tin cá nhân/bí mật. - Log lỗi cần đủ ngữ cảnh để truy tìm
nhưng không làm lộ dữ liệu nhạy cảm. - Phân biệt cấu hình development và
production. - Không dùng `console.log` tràn lan thay cho logger thống
nhất trong code ứng dụng.

### `pino-http` -- `^11.0.0`

**Vai trò:** Middleware tích hợp Pino với HTTP request/response của ứng
dụng.

**Sử dụng ở đâu:** - Ghi nhận request HTTP đi vào Express. - Theo dõi
thông tin request/response cần thiết. - Hỗ trợ truy vết lỗi theo
request.

**Module liên quan:** Cấu hình Express dùng chung.

**Nguyên tắc sử dụng:** - Cấu hình middleware tại điểm khởi tạo
Express. - Cân nhắc bỏ qua hoặc giảm log cho các endpoint health-check
nếu cần. - Redact hoặc loại bỏ authorization header, cookie, token và dữ
liệu nhạy cảm. - Không ghi request/response body một cách không kiểm
soát.

------------------------------------------------------------------------

# 4. Development dependencies

Các package trong phần này hiện được khai báo tại `devDependencies`.

## 4.1. TypeScript và công cụ chạy code

### `typescript` -- `^7.0.2`

**Vai trò:** Compiler và hệ thống kiểu của TypeScript.

**Sử dụng ở đâu:** - Kiểm tra kiểu dữ liệu trong source code. - Biên
dịch TypeScript thành JavaScript. - Hỗ trợ quá trình build Backend.

**Module liên quan:** Toàn bộ Backend.

**Nguyên tắc sử dụng:** - Giữ chế độ kiểm tra kiểu nghiêm ngặt theo cấu
hình dự án. - Không lạm dụng `any` để né lỗi kiểu. - Không coi
TypeScript type là runtime validation; dữ liệu từ HTTP request vẫn cần
Zod hoặc cơ chế validation runtime. - Khi có thay đổi cấu hình
TypeScript, kiểm tra lại cả lệnh build và lệnh dev.

### `tsx` -- `^4.23.15`

**Vai trò:** Chạy TypeScript trực tiếp trong môi trường Node.js khi phát
triển.

**Sử dụng ở đâu:** - Script `dev`: `tsx watch src/server.ts`. - Theo dõi
source và tự khởi động lại tiến trình khi có thay đổi.

**Module liên quan:** Quy trình phát triển Backend.

**Nguyên tắc sử dụng:** - Dùng cho môi trường phát triển. - Production
hiện chạy JavaScript đã biên dịch trong `dist`. - Không nhầm `tsx` với
TypeScript compiler; việc build vẫn do `tsc` thực hiện.

### `@types/node` -- `^26.6.6`

**Vai trò:** Khai báo kiểu TypeScript cho các API của Node.js.

**Sử dụng ở đâu:** - `process`, `Buffer`, module Node.js và các API
runtime khác. - Các phần cấu hình server, file, stream, environment và
xử lý hệ thống.

**Module liên quan:** Toàn bộ Backend.

### `@types/express` -- `^5.0.6`

**Vai trò:** Khai báo kiểu TypeScript cho Express 5.

**Sử dụng ở đâu:** - Kiểu `Request`, `Response`, `NextFunction`. - Kiểu
middleware, route handler và các thành phần Express khác.

**Module liên quan:** Các route, middleware và controller sử dụng
Express.

### `@types/pg` -- `^8.23.1`

**Vai trò:** Khai báo kiểu TypeScript cho package `pg`.

**Sử dụng ở đâu:** - Các đoạn code trực tiếp sử dụng API của `pg`, bao
gồm pool/client nếu có. - Cấu hình PostgreSQL driver adapter nếu cần
kiểu tương ứng.

**Module liên quan:** Database/infrastructure.

**Ghi chú:** Đây là package kiểu, không phải PostgreSQL driver. Driver
thực tế là `pg`.

------------------------------------------------------------------------

## 4.2. Testing

### `vitest` -- `^5.1.0`

**Vai trò:** Test runner và framework kiểm thử tự động.

**Sử dụng ở đâu:** - Unit test cho hàm và service. - Integration test
cho các thành phần phối hợp. - Kiểm thử logic validation và nghiệp vụ. -
Chạy test trong quy trình phát triển và CI.

**Module liên quan:** Tất cả module Backend có logic cần kiểm thử.

**Nguyên tắc sử dụng:** - Test các trường hợp thành công, thất bại và dữ
liệu biên quan trọng. - Test nghiệp vụ độc lập khi có thể. - Test các
quy tắc bảo mật như xác thực, quyền sở hữu và phân quyền. - Không phụ
thuộc hoàn toàn vào test thủ công bằng Postman. - Tách dữ liệu test khỏi
dữ liệu phát triển hoặc dữ liệu thật. - Cần cấu hình môi trường database
test phù hợp trước khi chạy integration test.

### `supertest` -- `^7.3.1`

**Vai trò:** Gửi HTTP request đến ứng dụng Node/Express trong bài kiểm
thử tự động.

**Sử dụng ở đâu:** - Kiểm thử endpoint API. - Kiểm tra HTTP status,
response body và headers. - Kiểm tra middleware, authentication và
authorization qua HTTP request.

**Module liên quan:** Các API của mọi module Backend.

**Nguyên tắc sử dụng:** - Dùng kết hợp với Vitest để tổ chức và chạy
test. - Ưu tiên kiểm thử ứng dụng Express mà không cần mở cổng server
thật nếu cách tổ chức ứng dụng cho phép. - Kiểm thử cả request hợp lệ và
request không hợp lệ. - Không dùng Supertest thay cho kiểm thử trình
duyệt E2E.

### `@types/supertest` -- `^7.2.1`

**Vai trò:** Khai báo kiểu TypeScript cho Supertest.

**Sử dụng ở đâu:** File test TypeScript có sử dụng Supertest.

### `@vitest/coverage-v8` -- `^5.1.0`

**Vai trò:** Thu thập báo cáo code coverage thông qua V8 cho Vitest.

**Sử dụng ở đâu:** - Đo mức độ code được thực thi bởi các bài test. -
Xem phần code nào chưa được kiểm thử. - Hỗ trợ đánh giá chất lượng bộ
test.

**Nguyên tắc sử dụng:** - Coverage cao không đồng nghĩa với test tốt. -
Cần kiểm tra chất lượng assertion và các trường hợp nghiệp vụ được bao
phủ. - Không chạy coverage như một mục tiêu hình thức hoặc cố tăng phần
trăm bằng test không có giá trị.

### Postman -- công cụ bên ngoài, không phải package Backend

Postman được sử dụng để kiểm thử API thủ công khi cần: - Gửi request
trực tiếp. - Kiểm tra headers, body, token và response. - Thử các trường
hợp lỗi hoặc kiểm tra nhanh endpoint trong quá trình phát triển.

Postman không nằm trong `dependencies` hoặc `devDependencies` của
Backend. Nó không thay thế Vitest và Supertest trong kiểm thử tự động.

------------------------------------------------------------------------

## 4.3. Hỗ trợ hiển thị log trong môi trường phát triển

### `pino-pretty` -- `^13.2.0`

**Vai trò:** Định dạng log Pino để con người dễ đọc trong terminal.

**Sử dụng ở đâu:** - Môi trường development. - Có thể dùng trong cấu
hình transport của Pino khi chạy local.

**Nguyên tắc sử dụng:** - Chủ yếu phục vụ trải nghiệm đọc log khi phát
triển. - Không cần dùng để xử lý log production. - Log production nên
giữ định dạng có cấu trúc để hệ thống thu thập log có thể xử lý.

------------------------------------------------------------------------

# 5. Bản đồ package theo module

Bảng dưới đây là bản đồ định hướng package theo nghiệp vụ. Một package
có thể được dùng chung ở nhiều module; không có nghĩa mỗi module phải tự
cài hoặc tự khởi tạo package đó.

  ------------------------------------------------------------------------
  Module / tầng           Package liên quan        Mục đích
  ----------------------- ------------------------ -----------------------
  Application / Express   `express`, `dotenv`,     Khởi tạo server, nạp
  setup                   `pino`, `pino-http`      cấu hình và logging
                                                   HTTP.

  Database /              `pg`,                    Kết nối PostgreSQL,
  Infrastructure          `@prisma/adapter-pg`,    truy vấn dữ liệu và
                          `@prisma/client`,        quản lý
                          `prisma`                 schema/migration.

  Auth                    `argon2`, `jose`,        Hash mật khẩu, JWT,
                          `google-auth-library`,   Google login, giới hạn
                          `express-rate-limit`,    request và validation.
                          `zod`                    

  User / Profile          `express`,               API hồ sơ, truy vấn
                          `@prisma/client`, `zod`, user, validation và xử
                          `multer`, `sharp`        lý avatar.

  Listing                 `express`,               API listing, truy vấn
                          `@prisma/client`, `zod`, dữ liệu, validation và
                          `multer`, `sharp`        xử lý media listing.

  Media                   `multer`, `sharp`,       Tiếp nhận upload, tối
                          `@prisma/client`         ưu ảnh và lưu metadata.

  Chat                    `express`,               API
                          `@prisma/client`,        conversation/message,
                          `socket.io`, `zod`       lưu dữ liệu và truyền
                                                   tin nhắn realtime.

  Notification            `express`,               Lưu thông báo, quản lý
                          `@prisma/client`,        trạng thái đọc và phát
                          `socket.io`, `zod`       sự kiện realtime.

  Reminder                `express`,               Kiểm tra điều kiện nhắc
                          `@prisma/client`, `zod`  hoàn thiện hồ sơ và
                                                   lưu/đọc trạng thái cần
                                                   thiết.

  Validation / Error      `zod`, `express`         Kiểm tra dữ liệu
  handling                                         runtime và xử lý lỗi
                                                   HTTP tập trung.

  Logging                 `pino`, `pino-http`,     Ghi log ứng dụng, HTTP
                          `pino-pretty`            và hỗ trợ đọc log
                                                   local.

  Backend testing         `vitest`, `supertest`,   Unit test,
                          `@types/supertest`,      integration/API test và
                          `@vitest/coverage-v8`    coverage.

  TypeScript /            `typescript`, `tsx`,     Chạy, biên dịch và kiểm
  Development             `@types/node`,           tra kiểu source code.
                          `@types/express`,        
                          `@types/pg`              
  ------------------------------------------------------------------------

------------------------------------------------------------------------

# 6. Luồng phối hợp package trong các nghiệp vụ tiêu biểu

Phần này mô tả vai trò phối hợp ở mức định hướng. Đây không phải mô tả
source code đã được triển khai.

## 6.1. Đăng ký tài khoản bằng username/password

1.  Express tiếp nhận request.
2.  Zod kiểm tra dữ liệu đầu vào.
3.  Rate limiter giới hạn request nếu endpoint thuộc nhóm cần bảo vệ.
4.  Prisma Client truy vấn kiểm tra dữ liệu tài khoản.
5.  Argon2 hash mật khẩu trước khi lưu.
6.  Prisma Client lưu tài khoản vào PostgreSQL.
7.  Pino ghi nhận sự kiện cần thiết, không ghi mật khẩu hoặc OTP.

OTP SMS/email và nhà cung cấp dịch vụ tương ứng là phần tích hợp riêng;
danh sách package hiện tại chưa có SDK của nhà cung cấp cụ thể.

## 6.2. Đăng nhập và xác thực request

1.  Express nhận request đăng nhập.
2.  Zod kiểm tra dữ liệu.
3.  Rate limiter bảo vệ endpoint đăng nhập.
4.  Prisma Client tìm tài khoản.
5.  Argon2 xác minh mật khẩu.
6.  JOSE tạo JWT sau khi xác thực thành công.
7.  Middleware sử dụng JOSE để xác minh token trong các request cần đăng
    nhập.
8.  Backend kiểm tra quyền truy cập tài nguyên trước khi xử lý nghiệp
    vụ.

## 6.3. Upload ảnh listing

1.  Express tiếp nhận multipart request.
2.  Multer xử lý file upload.
3.  Backend kiểm tra loại file, kích thước và số lượng.
4.  Sharp xử lý/tối ưu ảnh.
5.  Tầng media lưu file thông qua cơ chế storage được thiết kế.
6.  Prisma Client lưu metadata và quan hệ media với listing.
7.  Pino ghi log lỗi nếu quá trình upload/xử lý thất bại.

Multer và Sharp không quyết định kiến trúc lưu trữ lâu dài. Khi chuyển
từ local storage sang cloud storage, nên thay đổi adapter/service lưu
trữ thay vì để các module nghiệp vụ phụ thuộc trực tiếp vào đường dẫn
file local.

## 6.4. Gửi tin nhắn realtime

1.  Client kết nối Socket.IO và được xác thực.
2.  Backend kiểm tra quyền truy cập conversation.
3.  Dữ liệu message được validation.
4.  Prisma Client lưu message vào database.
5.  Sau khi lưu thành công, Socket.IO phát sự kiện đến client phù hợp.
6.  Notification có thể được tạo và phát sự kiện cập nhật số lượng chưa
    đọc theo nghiệp vụ.
7.  Pino ghi nhận lỗi cần thiết mà không ghi nội dung nhạy cảm không cần
    thiết.

Database là nguồn dữ liệu chính. Không được chỉ phát message qua
Socket.IO mà bỏ qua việc lưu trữ bền vững.

## 6.5. Kiểm thử API

1.  Vitest khởi chạy test.
2.  Supertest gửi HTTP request đến ứng dụng Express.
3.  Test kiểm tra status code, response và kết quả mong đợi.
4.  Có thể sử dụng database test riêng cho integration test.
5.  Coverage V8 cung cấp báo cáo độ bao phủ.
6.  Postman tiếp tục được dùng cho kiểm tra thủ công khi cần.

------------------------------------------------------------------------

# 7. Những package chưa có trong danh sách Backend hiện tại

Các mục dưới đây **không được xem là đã cài** chỉ vì chúng xuất hiện
trong kế hoạch hoặc được nhắc đến trong tài liệu nghiệp vụ.

  ----------------------------------------------------------------------------
  Package / công cụ       Trạng thái theo         Ghi chú
                          `package.json` hiện tại 
  ----------------------- ----------------------- ----------------------------
  `socket.io-client`      Không có trong Backend  Package dành cho Frontend
                                                  Angular để kết nối
                                                  Socket.IO.

  `nodemailer`            Không có                Chỉ cân nhắc nếu chọn
                                                  SMTP/Nodemailer cho email.

  SDK nhà cung cấp SMS    Chưa có                 Chọn sau khi quyết định nhà
                                                  cung cấp SMS.

  SDK nhà cung cấp email  Chưa có                 Chọn sau khi quyết định nhà
                                                  cung cấp email.

  AWS SDK S3              Chưa có                 Chỉ cần khi tích hợp
                                                  S3-compatible/cloud object
                                                  storage.

  FFmpeg / FFprobe        Chưa có                 Cần xem xét nếu Backend phải
  wrapper                                         kiểm tra thời lượng,
                                                  metadata hoặc xử lý video.

  Redis client            Chưa có                 Chưa cần cho cấu hình Đồ án
                                                  1 một Backend instance hiện
                                                  tại.

  BullMQ                  Chưa có                 Chưa có nhu cầu triển khai
                                                  queue riêng ở phạm vi hiện
                                                  tại.

  `node-cron`             Chưa có                 Reminder hiện được định
                                                  hướng kiểm tra khi người
                                                  dùng bắt đầu phiên, chưa cần
                                                  cron job.

  Search engine riêng     Chưa có                 Đồ án 1 ưu tiên PostgreSQL;
                                                  chưa cần cài
                                                  Meilisearch/Elasticsearch.

  Playwright              Chưa có                 Có thể bổ sung khi triển
                                                  khai E2E test.

  `winston`               Không có                Dự án đã chọn Pino làm
                                                  logging library; không cài
                                                  thêm Winston nếu không có lý
                                                  do rõ ràng.
  ----------------------------------------------------------------------------

**Lưu ý:** Một công cụ hệ thống như FFmpeg có thể cần được cài ở môi
trường máy chủ/container; không nhất thiết phải là package npm. Cần
quyết định sau khi chốt yêu cầu xử lý video.

------------------------------------------------------------------------

# 8. Nguyên tắc bắt buộc dành cho AI Agent

Khi làm việc trong Backend Looply, AI Agent cần tuân thủ các nguyên tắc
sau:

1.  **Đọc `backend/package.json` trước khi đề xuất cài package.** Không
    đề xuất cài lại package đã có.
2.  **Ưu tiên tái sử dụng package hiện có.** Chỉ thêm dependency khi có
    yêu cầu kỹ thuật cụ thể mà các package hiện tại không đáp ứng hợp
    lý.
3.  **Không tự ý thay đổi major version** của Express, Prisma,
    TypeScript hoặc các package nền tảng nếu chưa phân tích ảnh hưởng và
    thống nhất.
4.  **Phân biệt runtime và development dependency.** Package chỉ dùng
    cho test/build/dev thường thuộc `devDependencies`.
5.  **Không nhầm package Backend với Frontend.** Ví dụ `socket.io` thuộc
    Backend; `socket.io-client` thuộc Frontend.
6.  **Không nhầm cài package với triển khai chức năng.** Package có
    trong `package.json` không chứng minh module đã được cấu hình hoặc
    nghiệp vụ đã hoàn thành.
7.  **Không tạo nhiều kết nối Prisma Client không cần thiết.** Dùng cơ
    chế database dùng chung được tổ chức tập trung.
8.  **Không bỏ qua validation Backend.** Frontend validation cải thiện
    trải nghiệm nhưng không thay thế kiểm tra ở Backend.
9.  **Không bỏ qua authorization.** JWT hợp lệ không có nghĩa người dùng
    được quyền truy cập mọi tài nguyên.
10. **Không để lộ dữ liệu nhạy cảm.** Đặc biệt là password, OTP, token,
    secret và thông tin xác thực trong log hoặc response.
11. **Database là nguồn dữ liệu chính.** Socket.IO dùng để truyền sự
    kiện realtime, không thay thế việc lưu dữ liệu.
12. **Không thêm package chỉ để giải quyết vấn đề nhỏ** nếu có thể xử lý
    rõ ràng bằng nền tảng hoặc package hiện tại.
13. **Cập nhật tài liệu khi dependency thay đổi.** Nếu thêm, gỡ hoặc
    thay package, cần cập nhật file này để AI Agent không sử dụng thông
    tin cũ.
14. **Kiểm tra API và tài liệu chính thức khi dùng API package có thay
    đổi theo phiên bản.** Không tự suy đoán API từ phiên bản cũ.

------------------------------------------------------------------------

# 9. Trạng thái và phạm vi của tài liệu

-   Đây là danh sách package được ghi nhận từ `backend/package.json` tại
    thời điểm tạo tài liệu.
-   Phiên bản được ghi theo version range trong package manifest, không
    phải cam kết về phiên bản thực tế đã resolve trong
    `package-lock.json`.
-   Cấu hình chi tiết, cách khởi tạo, dependency injection, cấu trúc thư
    mục và cách sử dụng cụ thể cần được đối chiếu với source code thực
    tế.
-   Khi có thay đổi trong quá trình triển khai, cập nhật tài liệu này
    cùng với code.
-   Tài liệu này chỉ mô tả Backend. Frontend cần có tài liệu package
    riêng.

**Đường dẫn đề xuất trong repository:**

`docs/technical/backend/BACKEND_PACKAGES.md`
