import { Prisma } from "../../generated/prisma/client";
import { AppError } from "./app-error";

const prismaFailures: Record<string, { status: number; code: string; message: string }> = {
  P2000: { status: 400, code: "VALIDATION_ERROR", message: "A value exceeds the allowed length." },
  P2002: { status: 409, code: "CONFLICT", message: "The resource conflicts with existing data." },
  P2003: {
    status: 409,
    code: "REFERENCE_CONFLICT",
    message: "The related resource prevents this operation.",
  },
  P2025: { status: 404, code: "NOT_FOUND", message: "The requested resource was not found." },
  P2034: {
    status: 409,
    code: "CONCURRENT_MODIFICATION",
    message: "The resource changed; retry the operation.",
  },
  P2024: {
    status: 503,
    code: "DATABASE_UNAVAILABLE",
    message: "The service is temporarily unavailable.",
  },
};

/** Ánh xạ kiểu lỗi tin cậy sang lỗi công khai; không lộ Prisma meta, SQL hoặc thông báo tùy ý. */
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const failure = prismaFailures[error.code];
    if (failure) return new AppError(failure.status, failure.code, failure.message);
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new AppError(503, "DATABASE_UNAVAILABLE", "The service is temporarily unavailable.");
  }
  if (typeof error === "object" && error !== null && "type" in error) {
    if (error.type === "entity.parse.failed")
      return new AppError(400, "INVALID_JSON", "The request body is not valid JSON.");
    if (error.type === "entity.too.large")
      return new AppError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
    if (error.type === "encoding.unsupported" || error.type === "charset.unsupported") {
      return new AppError(415, "UNSUPPORTED_ENCODING", "The request encoding is not supported.");
    }
  }
  if (error instanceof URIError)
    return new AppError(400, "INVALID_REQUEST", "The request path is not valid.");
  return new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
}
