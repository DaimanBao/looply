import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { AppError } from "../../shared/errors/app-error";

export interface ObjectStore { put(key: string, bytes: Buffer): Promise<void>; get(key: string): Promise<Buffer>; delete(key: string): Promise<void>; }
export class LocalObjectStore implements ObjectStore {
  private readonly root: string;
  /** Restricts local development media to an explicitly configured directory. */
  constructor(directory: string) { this.root = resolve(directory); }
  /** Prevents stored or untrusted keys from escaping the media root, including Windows separators. */
  private path(key: string): string {
    const path = resolve(this.root, key);
    if (!/^[a-zA-Z0-9_./-]+$/.test(key) || !path.startsWith(this.root + sep)) throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is unavailable.");
    return path;
  }
  /** Stores only validated, optimized bytes under a generated opaque key. */
  async put(key: string, bytes: Buffer): Promise<void> { const path = this.path(key); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes, { flag: "wx" }); }
  /** Reads through the authorized HTTP route; local storage is never mounted as a public directory. */
  async get(key: string): Promise<Buffer> { return readFile(this.path(key)); }
  /** Makes retries safe when a previous attempt already removed the object. */
  async delete(key: string): Promise<void> { await rm(this.path(key), { force: true }); }
}
export class S3ObjectStore implements ObjectStore {
  /** Uses the S3-compatible provider selected by deployment configuration; credentials never enter HTTP DTOs. */
  constructor(private readonly client: S3Client, private readonly bucket: string) {}
  /** Persists optimized private images, leaving access authorization to Backend. */
  async put(key: string, bytes: Buffer): Promise<void> { await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: "image/webp" })); }
  /** Fetches private bytes without exposing a reusable storage URL. */
  async get(key: string): Promise<Buffer> {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!object.Body) throw new AppError(404, "NOT_FOUND", "Media not found.");
    return Buffer.from(await object.Body.transformToByteArray());
  }
  /** S3 deletion is idempotent; failures propagate so the outbox can retry. */
  async delete(key: string): Promise<void> { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); }
}
