export type ValidationIssue = { path: string; code: string };

export class AppError extends Error {
  /** Carries only an intentional public message; internal causes must never be placed here. */
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
