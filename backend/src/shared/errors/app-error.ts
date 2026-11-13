export type ValidationIssue = { path: string; code: string };

export class AppError extends Error {
  /** Chỉ mang thông báo công khai có chủ đích; không đặt nguyên nhân nội bộ ở đây. */
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ValidationIssue[],
  ) {
    super(message);
    this.name = "AppError";
  }
}
