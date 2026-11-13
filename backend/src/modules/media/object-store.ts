import { mkdir, readFile, writeFile, rm, opendir, lstat, open, stat } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, resolve, sep } from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { AppError } from "../../shared/errors/app-error";

export type StoredMediaObject = { key: string; modifiedAt: Date };
export interface ObjectStore {
  put(key: string, bytes: Buffer, mimeType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  listManaged?(): AsyncGenerator<StoredMediaObject>;
  putFile?(key: string, path: string, mimeType: string, size: number): Promise<void>;
  size?(key: string): Promise<number>;
  readRange?(key: string, start: number, end: number): Promise<Readable>;
}
export class LocalObjectStore implements ObjectStore {
  private readonly root: string;
  /** Restricts local development media to an explicitly configured directory. */
  constructor(directory: string) { this.root = resolve(directory); }
  /** Prevents stored or untrusted keys from escaping the media root, including Windows separators. */
  private path(key: string): string {
    const path = resolve(this.root, key);
    if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/.test(key) || key.split("/").some((part) => !part || part === "." || part === "..") || !path.startsWith(this.root + sep)) throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is unavailable.");
    return path;
  }
  /** Refuses symlinked path components rather than following a link outside the private root. */
  private async checkedPath(key: string): Promise<string> {
    const path = this.path(key);
    let current = this.root;
    for (const part of ["", ...key.split("/")]) {
      current = resolve(current, part);
      try {
        if ((await lstat(current)).isSymbolicLink()) throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is unavailable.");
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    }
    return path;
  }
  /** Stores only validated, optimized bytes under a generated opaque key. */
  async put(key: string, bytes: Buffer): Promise<void> { const path = await this.checkedPath(key); await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await writeFile(path, bytes, { flag: "wx", mode: 0o600, signal: AbortSignal.timeout(30_000) }); }
  /** Reads through the authorized HTTP route; local storage is never mounted as a public directory. */
  async get(key: string): Promise<Buffer> { return readFile(await this.checkedPath(key), { signal: AbortSignal.timeout(30_000) }); }
  /** Makes retries safe when a previous attempt already removed the object. */
  async delete(key: string): Promise<void> { await rm(await this.checkedPath(key), { force: true }); }
  /** Copies validated staging without retaining the entire video in memory. */
  async putFile(key: string, source: string, _mimeType: string, size: number): Promise<void> {
    if ((await stat(source)).size !== size) throw new Error("Staging size changed");
    const path = await this.checkedPath(key); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await pipeline(createReadStream(source), createWriteStream(path, { flags: "wx", mode: 0o600 }), { signal: AbortSignal.timeout(30000) });
  }
  /** Checks readiness without loading video bytes while holding database locks. */
  async size(key: string): Promise<number> { return (await stat(await this.checkedPath(key))).size; }
  /** Opens an authorized bounded file descriptor; consumption continues after the transaction commits. */
  async readRange(key: string, start: number, end: number): Promise<Readable> {
    const handle = await open(await this.checkedPath(key), "r");
    try { const info = await handle.stat(); if (!info.isFile() || end >= info.size) throw new Error("Invalid stored size"); return handle.createReadStream({ start, end, autoClose: true }); }
    catch (error) { await handle.close(); throw error; }
  }
  /** Streams only app-owned generated names; directory cursors bound memory and survive between worker ticks. */
  async *listManaged(): AsyncGenerator<StoredMediaObject> {
    for (const prefix of ["profile", "listing/v1"]) {
      const directory = await this.checkedPath(prefix);
      let entries;
      try { entries = await opendir(directory); }
      catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
        throw error;
      }
      for await (const entry of entries) {
        if (!entry.isFile() || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.thumbnail)?\.(?:webp|complete|mp4|webm|mp4.complete|webm.complete)$/.test(entry.name)) continue;
        if (prefix === "profile" && /\.(mp4|webm)(\.complete)?$/.test(entry.name)) continue;
        const key = `${prefix}/${entry.name}`;
        try { yield { key, modifiedAt: (await lstat(await this.checkedPath(key))).mtime }; }
        catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
      }
    }
  }
}
export class S3ObjectStore implements ObjectStore {
  /** Uses the S3-compatible provider selected by deployment configuration; credentials never enter HTTP DTOs. */
  constructor(private readonly client: S3Client, private readonly bucket: string) {}
  /** Keeps generated keys immutable across concurrent writers, including writes delayed until after attachment. */
  async put(key: string, bytes: Buffer, mimeType = "image/webp"): Promise<void> { await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: mimeType, IfNoneMatch: "*" }), { abortSignal: AbortSignal.timeout(30_000) }); }
  /** Streams immutable validated bytes with their real MIME rather than image defaults. */
  async putFile(key: string, path: string, mimeType: string, size: number): Promise<void> {
    const body = createReadStream(path);
    try { await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentLength: size, ContentType: mimeType, IfNoneMatch: "*" }), { abortSignal: AbortSignal.timeout(30000) }); }
    finally { body.destroy(); }
  }
  /** Uses private HEAD metadata for bounded readiness checks. */
  async size(key: string): Promise<number> {
    const object = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: AbortSignal.timeout(5000) });
    if (!Number.isSafeInteger(object.ContentLength) || !object.ContentLength) throw new Error("Missing object size");
    return object.ContentLength;
  }
  /** Requests only the authorized byte interval and bounds the lifetime of the upstream response. */
  async readRange(key: string, start: number, end: number): Promise<Readable> {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=${start}-${end}` }), { abortSignal: AbortSignal.timeout(30000) });
    if (!(object.Body instanceof Readable)) throw new Error("Missing private stream");
    if (object.ContentLength !== end - start + 1 || !object.ContentRange?.startsWith(`bytes ${start}-${end}/`)) { object.Body.destroy(); throw new Error("Invalid private range response"); }
    return object.Body;
  }
  /** Fetches private bytes without exposing a reusable storage URL. */
  async get(key: string): Promise<Buffer> {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: AbortSignal.timeout(30_000) });
    if (!object.Body) throw new AppError(404, "NOT_FOUND", "Media not found.");
    return Buffer.from(await object.Body.transformToByteArray());
  }
  /** S3 deletion is idempotent; failures propagate so the outbox can retry. */
  async delete(key: string): Promise<void> { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: AbortSignal.timeout(30_000) }); }
}
