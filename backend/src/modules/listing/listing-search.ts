/** Giữ tiêu đề lưu trữ và truy vấn khám phá trên cùng biểu diễn tìm kiếm tiếng Việt chuẩn. */
export function normalizeListingTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, " ");
}
