import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, chmod, rm, opendir, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error";
import { maxVideoBytes, videoConfig } from "./video-config";

let activeUploads = 0;
/** Chỉ xóa thư mục yêu cầu riêng đã cũ; hạn upload/validation ngắn hơn tuổi này. */
async function sweepStaging(root: string): Promise<void> {
  const entries = await opendir(root);
  let scanned = 0;
  for await (const entry of entries) {
    if (++scanned > 100) break;
    if (!/^upload-[a-zA-Z0-9]{6}$/.test(entry.name) || !entry.isDirectory()) continue;
    const path = join(root, entry.name);
    const info = await lstat(path);
    if (!info.isSymbolicLink() && info.mtimeMs < Date.now() - 60 * 60_000)
      await rm(path, { recursive: true, force: true });
  }
}
/** Stream upload thô có giới hạn vào staging riêng; giữ slot của tiến trình đến khi kiểm tra/ghi xong. */
export const stageListingUpload: RequestHandler = async (request, response, next) => {
  const config = videoConfig();
  if (
    !request.is("application/octet-stream") ||
    (request.headers["content-encoding"] && request.headers["content-encoding"] !== "identity")
  ) {
    next(
      new AppError(
        415,
        "UNSUPPORTED_MEDIA",
        "Send uncompressed bytes as application/octet-stream.",
      ),
    );
    return;
  }
  if (Number(request.headers["content-length"]) > maxVideoBytes) {
    next(new AppError(413, "PAYLOAD_TOO_LARGE", "Choose a file up to 100 MiB."));
    return;
  }
  if (activeUploads >= config.MEDIA_UPLOAD_CONCURRENCY) {
    next(new AppError(503, "MEDIA_UPLOAD_BUSY", "Try the upload again shortly."));
    return;
  }
  activeUploads++;
  let directory: string | undefined;
  let released = false;
  const controller = new AbortController();
  /** Hủy xử lý khi ngắt kết nối và chỉ xóa thư mục sinh riêng của yêu cầu sau khi công việc kết thúc. */
  const disconnected = () => {
    if (!response.writableFinished) controller.abort();
  };
  response.on("close", disconnected);
  /** Kết thúc quản lý tài nguyên một lần, kể cả staging lỗi trước khi controller chạy. */
  const release = async () => {
    if (released) return;
    released = true;
    activeUploads--;
    response.removeListener("close", disconnected);
    if (directory) await rm(directory, { recursive: true, force: true });
  };
  try {
    const root = resolve(config.MEDIA_STAGING_DIRECTORY);
    await mkdir(root, { recursive: true, mode: 0o700 });
    if ((await lstat(root)).isSymbolicLink()) throw new Error("Unsafe staging root");
    await chmod(root, 0o700);
    await sweepStaging(root);
    directory = await mkdtemp(join(root, "upload-"));
    await chmod(directory, 0o700);
    const path = join(directory, "input");
    let size = 0;
    const bounded = new Transform({
      transform(bytes: Buffer, _encoding, callback) {
        size += bytes.length;
        callback(
          size > maxVideoBytes
            ? new AppError(413, "PAYLOAD_TOO_LARGE", "Choose a file up to 100 MiB.")
            : null,
          bytes,
        );
      },
    });
    const timer = setTimeout(() => controller.abort(), config.MEDIA_UPLOAD_TIMEOUT_MS);
    /** Truyền lỗi upload chưa đủ mà không để pipeline hủy HTTP socket trước response lỗi. */
    const aborted = () => controller.abort();
    request.on("aborted", aborted);
    request.on("error", aborted);
    request.pipe(bounded);
    try {
      await pipeline(bounded, createWriteStream(path, { flags: "wx", mode: 0o600 }), {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      request.unpipe(bounded);
      request.removeListener("aborted", aborted);
      request.removeListener("error", aborted);
      if (!request.complete) request.resume();
    }
    if (!size) throw new AppError(415, "UNSUPPORTED_MEDIA", "Send a nonempty file.");
    response.locals.stagedUpload = { path, signal: controller.signal, release };
    next();
  } catch (error) {
    await release();
    next(
      error instanceof AppError
        ? error
        : new AppError(503, "MEDIA_UNAVAILABLE", "Upload could not be completed."),
    );
  }
};
