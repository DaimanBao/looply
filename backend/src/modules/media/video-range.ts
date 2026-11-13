import { AppError } from "../../shared/errors/app-error";

/** Parses one RFC byte interval using BigInt so oversized user input cannot lose precision. */
export function videoRange(header: string | undefined, size: number): { start: number; end: number; partial: boolean } {
  if (header === undefined) return { start: 0, end: size - 1, partial: false };
  const match = header.length <= 128 ? /^bytes=(\d*)-(\d*)$/.exec(header) : null;
  if (!match || (!match[1] && !match[2])) throw new AppError(416, "INVALID_RANGE", "Choose a satisfiable single byte range.");
  const total = BigInt(size); let start: bigint; let end: bigint;
  if (!match[1]) { const suffix = BigInt(match[2]!); start = suffix >= total ? 0n : total - suffix; end = total - 1n; }
  else { start = BigInt(match[1]); end = match[2] ? BigInt(match[2]) : total - 1n; if (end >= total) end = total - 1n; }
  if (start < 0n || start >= total || end < start) throw new AppError(416, "INVALID_RANGE", "Choose a satisfiable single byte range.");
  return { start: Number(start), end: Number(end), partial: true };
}
