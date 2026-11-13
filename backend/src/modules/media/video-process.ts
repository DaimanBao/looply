import { spawn } from "node:child_process";
import { AppError } from "../../shared/errors/app-error";

/** Chạy executable trực tiếp với giới hạn đầu ra/thời gian, dừng và thu dọn tiến trình trước khi báo lỗi. */
export function runVideoProcess(
  binary: string,
  args: string[],
  timeout: number,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AppError(503, "MEDIA_VIDEO_UNAVAILABLE", "Video validation was interrupted."));
      return;
    }
    const child = spawn(binary, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let diagnostics = "";
    let failure: AppError | undefined;
    /** Dừng tiến trình con ngay; chờ close để staging không bị tái sử dụng khi còn mở. */
    const stop = () => {
      failure = new AppError(
        503,
        "MEDIA_VIDEO_UNAVAILABLE",
        "Video validation is temporarily unavailable.",
      );
      child.kill("SIGKILL");
    };
    const timer = setTimeout(stop, timeout);
    signal?.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", (bytes: Buffer) => {
      if (Buffer.byteLength(output) + bytes.length > 128 * 1024) stop();
      else output += bytes.toString();
    });
    child.stderr.on("data", (bytes: Buffer) => {
      if (Buffer.byteLength(diagnostics) + bytes.length > 64 * 1024) stop();
      else diagnostics += bytes.toString();
    });
    child.on("error", () => {
      failure = new AppError(
        503,
        "MEDIA_VIDEO_UNAVAILABLE",
        "Video validation is temporarily unavailable.",
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      if (failure) reject(failure);
      else if (code !== 0 || diagnostics.trim())
        reject(
          new AppError(415, "UNSUPPORTED_MEDIA", "Choose a complete, decodable MP4 or WebM video."),
        );
      else resolve(output);
    });
  });
}
