# REVIEW — Rà soát

## Đầu vào
- Mã nguồn đã qua TESTING và kết quả kiểm thử.
- Yêu cầu ANALYSIS, thiết kế DESIGN và quy tắc dự án.

## Nhiệm vụ của AI Agent
1. Đối chiếu code với yêu cầu, tiêu chí chấp nhận và thiết kế; phát hiện chức năng thiếu hoặc sai.
2. Rà soát kiến trúc, phân tách trách nhiệm, khả năng bảo trì, xử lý lỗi, bảo mật, phân quyền và hiệu năng ở mức cần thiết.
3. Kiểm tra thay đổi ngoài phạm vi, code trùng lặp, dependency không cần thiết, secrets và nguy cơ mất dữ liệu.
4. Ưu tiên phát hiện có mức độ ảnh hưởng cao; nêu rõ vị trí, vấn đề và hướng khắc phục, tránh nhận xét chung chung.
5. Sửa lỗi trong phạm vi đã thống nhất, sau đó chạy lại kiểm thử bị ảnh hưởng. Nếu cần thay đổi thiết kế hoặc nghiệp vụ, quay về giai đoạn tương ứng.

## Đầu ra
- Danh sách phát hiện và trạng thái xử lý; kết luận có đủ điều kiện hoàn tất hay chưa.

## Điều kiện chuyển sang COMPLETION
- Không còn vấn đề nghiêm trọng chưa xử lý; các thay đổi sau review đã được kiểm chứng.
- Không tự merge, push hoặc thay đổi quy tắc repository khi chưa được yêu cầu.
