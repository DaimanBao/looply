import { mkdir, readFile, writeFile, rm, opendir, lstat, open, stat } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, resolve, sep } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { AppError } from "../../shared/errors/app-error";

export type StoredMediaObject = { key: string; modifiedAt: Date };
export interface ObjectStore {
  put(key: string, bytes: Buffer, mimeType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  listManaged?(prefixes?: readonly string[]): AsyncGenerator<StoredMediaObject>;
  putFile?(key: string, path: string, mimeType: string, size: number): Promise<void>;
  size?(key: string): Promise<number>;
  readRange?(key: string, start: number, end: number): Promise<Readable>;
}
export class LocalObjectStore implements ObjectStore {
  private readonly root: string;

  /** Giới hạn media development local trong thư mục được cấu hình tường minh. */
  constructor(directory: string) {
    this.root = resolve(directory);
  }

  /** Ngăn khóa lưu trữ hoặc không tin cậy thoát media root, kể cả dấu phân cách Windows. */
  private path(key: string): string {
    const path = resolve(this.root, key);
    if (
      !/^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/.test(key) ||
      key.split("/").some((part) => !part || part === "." || part === "..") ||
      !path.startsWith(this.root + sep)
    )
      throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is unavailable.");
    return path;
  }

  /** Từ chối thành phần đường dẫn symlink thay vì theo liên kết ra ngoài root riêng tư. */
  private async checkedPath(key: string): Promise<string> {
    const path = this.path(key);
    let current = this.root;
    for (const part of ["", ...key.split("/")]) {
      current = resolve(current, part);
      try {
        if ((await lstat(current)).isSymbolicLink())
          throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is unavailable.");
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    }
    return path;
  }

  /** Chỉ lưu byte đã kiểm tra, tối ưu dưới khóa opaque được sinh. */
  async put(key: string, bytes: Buffer): Promise<void> {
    const path = await this.checkedPath(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, bytes, { flag: "wx", mode: 0o600, signal: AbortSignal.timeout(30_000) });
  }

  /** Đọc qua HTTP route có phân quyền; storage local không được mount thành thư mục công khai. */
  async get(key: string): Promise<Buffer> {
    return readFile(await this.checkedPath(key), { signal: AbortSignal.timeout(30_000) });
  }

  /** Cho phép thử lại an toàn khi lần trước đã xóa object. */
  async delete(key: string): Promise<void> {
    await rm(await this.checkedPath(key), { force: true });
  }

  /** Sao chép staging đã kiểm tra mà không giữ toàn bộ video trong bộ nhớ. */
  async putFile(key: string, source: string, _mimeType: string, size: number): Promise<void> {
    if ((await stat(source)).size !== size) throw new Error("Staging size changed");
    const path = await this.checkedPath(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await pipeline(
      createReadStream(source),
      createWriteStream(path, { flags: "wx", mode: 0o600 }),
      { signal: AbortSignal.timeout(30000) },
    );
  }

  /** Kiểm tra sẵn sàng mà không nạp byte video khi giữ khóa database. */
  async size(key: string): Promise<number> {
    return (await stat(await this.checkedPath(key))).size;
  }

  /** Mở file descriptor có phân quyền và giới hạn; tiếp tục đọc sau khi transaction commit. */
  async readRange(key: string, start: number, end: number): Promise<Readable> {
    const handle = await open(await this.checkedPath(key), "r");
    try {
      const info = await handle.stat();
      if (!info.isFile() || end >= info.size) throw new Error("Invalid stored size");
      return handle.createReadStream({ start, end, autoClose: true });
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  /** Chỉ stream tên sinh thuộc ứng dụng; cursor thư mục giới hạn bộ nhớ và tiếp tục giữa các nhịp worker. */
  async *listManaged(
    prefixes: readonly string[] = ["profile", "listing/v1"],
  ): AsyncGenerator<StoredMediaObject> {
    for (const prefix of prefixes) {
      if (!["profile", "listing/v1", "chat", "chat-snapshot"].includes(prefix))
        throw new Error("Invalid managed inventory prefix");
      const directory = await this.checkedPath(prefix);
      let entries;
      try {
        entries = await opendir(directory);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
        throw error;
      }
      for await (const entry of entries) {
        if (
          !entry.isFile() ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.thumbnail)?\.(?:webp|complete|mp4|webm|mp4.complete|webm.complete)$/.test(
            entry.name,
          )
        )
          continue;
        if (prefix !== "listing/v1" && /\.(mp4|webm)(\.complete)?$/.test(entry.name)) continue;
        const key = `${prefix}/${entry.name}`;
        try {
          yield { key, modifiedAt: (await lstat(await this.checkedPath(key))).mtime };
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
      }
    }
  }
}
export class S3ObjectStore implements ObjectStore {
  /** Dùng provider S3-compatible được cấu hình triển khai chọn; credential không vào HTTP DTO. */
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  /** Giữ khóa được sinh bất biến giữa các bên ghi đồng thời, kể cả ghi trì hoãn sau đính kèm. */
  async put(key: string, bytes: Buffer, mimeType = "image/webp"): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: mimeType,
        IfNoneMatch: "*",
      }),
      { abortSignal: AbortSignal.timeout(30_000) },
    );
  }

  /** Stream byte bất biến đã kiểm tra với MIME thực thay vì mặc định ảnh. */
  async putFile(key: string, path: string, mimeType: string, size: number): Promise<void> {
    const body = createReadStream(path);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentLength: size,
          ContentType: mimeType,
          IfNoneMatch: "*",
        }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
    } finally {
      body.destroy();
    }
  }

  /** Dùng metadata HEAD riêng cho kiểm tra sẵn sàng có giới hạn. */
  async size(key: string): Promise<number> {
    const object = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(5000) },
    );
    if (!Number.isSafeInteger(object.ContentLength) || !object.ContentLength)
      throw new Error("Missing object size");
    return object.ContentLength;
  }

  /** Chỉ yêu cầu khoảng byte được cấp quyền và giới hạn vòng đời response upstream. */
  async readRange(key: string, start: number, end: number): Promise<Readable> {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=${start}-${end}` }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
    if (!(object.Body instanceof Readable)) throw new Error("Missing private stream");
    if (
      object.ContentLength !== end - start + 1 ||
      !object.ContentRange?.startsWith(`bytes ${start}-${end}/`)
    ) {
      object.Body.destroy();
      throw new Error("Invalid private range response");
    }
    return object.Body;
  }

  /** Lấy byte riêng mà không lộ URL storage có thể tái sử dụng. */
  async get(key: string): Promise<Buffer> {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(30_000),
    });
    if (!object.Body) throw new AppError(404, "NOT_FOUND", "Media not found.");
    return Buffer.from(await object.Body.transformToByteArray());
  }

  /** Xóa S3 là idempotent; truyền lỗi để outbox thử lại. */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(30_000),
    });
  }
}
