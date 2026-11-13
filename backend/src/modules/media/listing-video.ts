import { open, stat } from "node:fs/promises";
import { z } from "zod";
import { AppError } from "../../shared/errors/app-error";
import { maxVideoBytes, videoConfig } from "./video-config";
import { runVideoProcess } from "./video-process";

export type ValidatedVideo = { path: string; sizeBytes: number; mimeType: "video/mp4" | "video/webm"; durationSeconds: number; extension: "mp4" | "webm" };
const probeSchema = z.object({ format: z.object({ format_name: z.string(), duration: z.string().optional() }), streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string(), width: z.number().optional(), height: z.number().optional(), duration: z.string().optional() })).min(1).max(2) });
const mp4Brands = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "dash"]);
/** Reads bounded EBML header integers only; unknown lengths or precision loss cannot escape the header buffer. */
function ebmlInteger(bytes: Buffer, offset: number, identifier = false): { value: number; length: number } | null {
  const first = bytes[offset]; if (!first) return null;
  let mask = 0x80; let length = 1;
  while (!(first & mask)) { mask >>= 1; length++; }
  if (length > (identifier ? 4 : 8) || offset + length > bytes.length) return null;
  let value = BigInt(identifier ? first : first & (mask - 1));
  for (let index = 1; index < length; index++) value = value * 256n + BigInt(bytes[offset + index]!);
  if ((!identifier && value === (1n << BigInt(length * 7)) - 1n) || value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { value: Number(value), length };
}
/** Requires the actual DocType child of the EBML header, rather than a matching string in arbitrary payload. */
export function webmHeader(bytes: Buffer): boolean {
  const header = ebmlInteger(bytes, 4); if (!header) return false;
  const end = 4 + header.length + header.value; if (end > bytes.length) return false;
  let offset = 4 + header.length; let found = false;
  while (offset < end) {
    const id = ebmlInteger(bytes, offset, true); if (!id) return false; offset += id.length;
    const size = ebmlInteger(bytes, offset); if (!size) return false; offset += size.length;
    if (offset + size.value > end) return false;
    if (id.value === 0x4282) {
      if (found || size.value !== 4 || bytes.subarray(offset, offset + size.value).toString("ascii") !== "webm") return false;
      found = true;
    }
    offset += size.value;
  }
  return found && offset === end;
}
/** Identifies actual containers, excluding JPEG metadata, QuickTime and generic Matroska. */
export function videoSignature(bytes: Buffer): "mp4" | "webm" | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return null;
  if (bytes.subarray(4, 8).toString("ascii") === "ftyp") return "mp4";
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "webm";
  return null;
}
/** Rejects bad metadata before decoding and derives duration from inspected content, never client fields. */
export function videoMetadata(value: unknown, extension: "mp4" | "webm"): number {
  const result = probeSchema.safeParse(value);
  if (!result.success) throw new AppError(415, "UNSUPPORTED_MEDIA", "Video metadata is invalid.");
  const { streams, format } = result.data; const video = streams.filter((stream) => stream.codec_type === "video");
  if (video.length !== 1 || streams.some((stream) => !["video", "audio"].includes(stream.codec_type)) || !format.format_name.split(",").includes(extension === "mp4" ? "mp4" : "webm") || !video[0]?.width || !video[0]?.height || video[0].width * video[0].height > 40_000_000) throw new AppError(415, "UNSUPPORTED_MEDIA", "Unsupported video streams.");
  if (extension === "webm" && streams.some((stream) => !(stream.codec_type === "video" ? ["vp8", "vp9", "av1"] : ["opus", "vorbis"]).includes(stream.codec_name))) throw new AppError(415, "UNSUPPORTED_MEDIA", "Unsupported WebM codecs.");
  const durations = [format.duration, ...streams.map((stream) => stream.duration)].filter((value): value is string => value !== undefined).map(Number);
  if (!durations.length || durations.some((duration) => !Number.isFinite(duration) || duration <= 0)) throw new AppError(415, "UNSUPPORTED_MEDIA", "Video duration cannot be verified.");
  if (Math.max(...durations) > 180) throw new AppError(400, "VALIDATION_ERROR", "Choose a video up to 180 seconds.");
  if (!format.duration || durations.some((duration) => Math.abs(duration - Number(format.duration)) > 1)) throw new AppError(415, "UNSUPPORTED_MEDIA", "Video duration is inconsistent.");
  return Math.max(...durations);
}
/** Probes and fully decodes a private staging file outside database transactions without producing a rendition. */
export async function inspectListingVideo(path: string, signal?: AbortSignal): Promise<ValidatedVideo> {
  const sizeBytes = (await stat(path)).size;
  if (!sizeBytes || sizeBytes > maxVideoBytes) throw new AppError(413, "PAYLOAD_TOO_LARGE", "Choose a video up to 100 MiB.");
  const handle = await open(path, "r"); const header = Buffer.alloc(4096);
  let count: number;
  try { count = (await handle.read(header, 0, header.length, 0)).bytesRead; } finally { await handle.close(); }
  const bytes = header.subarray(0, count); const extension = videoSignature(bytes);
  if (!extension || (extension === "mp4" && (bytes.readUInt32BE(0) < 16 || bytes.readUInt32BE(0) > count || !mp4Brands.has(bytes.subarray(8, 12).toString("ascii")))) || (extension === "webm" && !webmHeader(bytes))) throw new AppError(415, "UNSUPPORTED_MEDIA", "Choose a valid MP4 or WebM video.");
  const config = videoConfig();
  for (const binary of [config.MEDIA_FFPROBE_PATH, config.MEDIA_FFMPEG_PATH]) {
    const version = await runVideoProcess(binary, ["-version"], 5000, signal);
    if (!version.split("\n")[0]?.includes(`version ${config.MEDIA_VIDEO_BINARY_VERSION}`)) throw new AppError(503, "MEDIA_VIDEO_UNAVAILABLE", "Video validator version is unavailable.");
  }
  const common = ["-v", "error", "-max_alloc", "67108864", "-protocol_whitelist", "file", "-format_whitelist", extension === "mp4" ? "mov" : "matroska,webm", "-threads", "1"];
  const metadata = await runVideoProcess(config.MEDIA_FFPROBE_PATH, [...common, "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,width,height,duration", "-of", "json", path], config.MEDIA_VIDEO_TIMEOUT_MS, signal);
  let parsed: unknown;
  try { parsed = JSON.parse(metadata); } catch { throw new AppError(415, "UNSUPPORTED_MEDIA", "Video metadata is invalid."); }
  const durationSeconds = videoMetadata(parsed, extension);
  const progress = await runVideoProcess(config.MEDIA_FFMPEG_PATH, ["-nostdin", "-xerror", "-err_detect", "explode", ...common, "-i", path, "-map", "0:v", "-map", "0:a?", "-threads", "1", "-filter_threads", "1", "-progress", "pipe:1", "-stats_period", "60", "-f", "null", "-"], config.MEDIA_VIDEO_TIMEOUT_MS, signal);
  const decoded = [...progress.matchAll(/^out_time_us=(\d+)$/gm)].map((match) => Number(match[1]) / 1000000);
  const actual = Math.max(...decoded);
  if (!Number.isFinite(actual) || actual <= 0 || !/^frame=\d*[1-9]\d*$/m.test(progress) || Math.abs(actual - durationSeconds) > 1) throw new AppError(415, "UNSUPPORTED_MEDIA", "Video content does not match its metadata.");
  if (actual > 180) throw new AppError(400, "VALIDATION_ERROR", "Choose a video up to 180 seconds.");
  return { path, sizeBytes, extension, mimeType: extension === "mp4" ? "video/mp4" : "video/webm", durationSeconds: Math.ceil(Math.max(durationSeconds, actual)) };
}
