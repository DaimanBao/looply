# Quy chuẩn formatting và comment

Áp dụng cho code do Looply sở hữu ở Backend, Frontend, utilities và tests. Tổ chức Angular theo [Frontend Structure](../structures/FRONTEND_STRUCTURE.md); không thay đổi logic hoặc kiến trúc chỉ để chuẩn hóa trình bày.

## Định dạng code

- Dùng UTF-8, indentation hai dấu cách; spacing, line breaks và dòng trống nhất quán. Giữ một dòng trống giữa các method.
- Không nén nhiều statement hoặc method vào một dòng. Xuống dòng cho object, callback và biểu thức dài để dễ đọc.
- Dùng Prettier đã có trong `frontend/node_modules`, không cài thêm dependency: `node frontend/node_modules/prettier/bin/prettier.cjs --write <files>` từ repository root. Backend và scripts dùng `--print-width 100 --end-of-line lf`, giữ dấu nháy kép mặc định; Frontend dùng cấu hình `frontend/.prettierrc` (100 ký tự, nháy đơn, parser Angular cho HTML).
- Chỉ format file thực sự thuộc phạm vi nhiệm vụ. Không sửa generated code, third-party code, lockfile hoặc migration lịch sử. Với Prisma/SQL, chỉ đổi trình bày/comment khi cần, giữ nguyên semantics và cú pháp.

## Comment

- Comment/JSDoc/TSDoc do dự án sở hữu và comment mới ở Backend/Frontend viết bằng tiếng Việt; mô tả mục đích, quy tắc hoặc lý do hữu ích.
- Giữ nguyên identifiers, API names, error codes và thuật ngữ kỹ thuật cần thiết. Không dịch license header, generated comment hoặc machine-readable directive như `@ts-expect-error`, `eslint-disable`, `prettier-ignore`.
- Tuân thủ yêu cầu comment hàm tại [AGENTS.md](../../AGENTS.md); không thêm comment dư thừa hoặc xóa giải thích hữu ích.

## Angular

- Page có giao diện dùng `templateUrl`. Tách template dài và style nhiều dòng thành `.html`/`.scss` cạnh file `.ts`; template component rất ngắn hoặc test host có thể giữ inline.
- Giữ tên file và cấu trúc feature hiện có khi đã đúng trách nhiệm. Chỉ tạo `.scss` khi có style riêng, `.spec.ts` khi có test có ý nghĩa; không tạo file rỗng để đủ bộ.
- Giữ nguyên binding, routing, API integration, Signals, RxJS và SSR/hydration. Không thêm abstraction hoặc sửa nghiệp vụ trong nhiệm vụ formatting.

## Kiểm chứng

Theo [Testing](../workflows/TESTING.md): thay đổi thuần formatting/comment chỉ cần review diff và `git diff --check`, không cần regression tests Backend. Sau tách file Angular, chạy build một lần và targeted component tests cho template bị ảnh hưởng; không mặc định full suite hoặc browser E2E. Không chạy lại kiểm tra đã PASS nếu trạng thái liên quan chưa đổi.
