import { mkdtemp, readFile, writeFile, rm, copyFile, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectListingVideo, videoMetadata, videoSignature, webmHeader } from "./listing-video";
import { runVideoProcess } from "./video-process";
import { maxVideoBytes } from "./video-config";

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "looply-video-validation-test-")); });
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
/** Resolves small committed synthetic fixtures; executable tools are provisioned separately, never mocked. */
function fixture(name: string) { return resolve("tests/fixtures/video", name); }

describe("video validation with real FFprobe/FFmpeg", () => {
  it.each(["mp4", "webm"])("validates complete %s independently of filename", async (extension) => {
    const path = join(directory, "untrusted.txt"); await copyFile(fixture(`valid.${extension}`), path);
    expect(await inspectListingVideo(path)).toMatchObject({ mimeType: `video/${extension}`, durationSeconds: 1, extension });
  });
  it("accepts 180 seconds and rejects 180.1 before rounding", async () => {
    expect((await inspectListingVideo(fixture("180-seconds.mp4"))).durationSeconds).toBe(180);
    await expect(inspectListingVideo(fixture("over-duration.mp4"))).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });
  it("validates both video and audio streams with real decoding", async () => {
    expect(await inspectListingVideo(fixture("with-audio.mp4"))).toMatchObject({ mimeType: "video/mp4", durationSeconds: 1 });
  });
  it("accepts exactly 100 MiB with valid padding and rejects one byte over", async () => {
    const path = join(directory, "boundary.mp4"); await copyFile(fixture("valid.mp4"), path);
    const file = await open(path, "r+");
    try { const size = (await file.stat()).size; const atom = Buffer.alloc(8); atom.writeUInt32BE(maxVideoBytes - size); atom.write("free", 4); await file.write(atom, 0, atom.length, size); await file.truncate(maxVideoBytes); } finally { await file.close(); }
    expect((await inspectListingVideo(path)).sizeBytes).toBe(maxVideoBytes);
    const oversized = await open(path, "r+"); try { await oversized.truncate(maxVideoBytes + 1); } finally { await oversized.close(); }
    await expect(inspectListingVideo(path)).rejects.toMatchObject({ status: 413 });
  });
  it("rejects forged container, missing streams, truncated metadata and corrupted payload", async () => {
    const original = await readFile(fixture("valid.mp4"));
    const corrupted = Buffer.from(original); const data = corrupted.indexOf(Buffer.from("mdat")) + 4; corrupted.fill(0xff, data, corrupted.length);
    for (const [index, bytes] of [Buffer.from("not a video"), original.subarray(0, 20), original.subarray(0, original.length - 40), corrupted].entries()) {
      const path = join(directory, `${index}.mp4`); await writeFile(path, bytes);
      await expect(inspectListingVideo(path)).rejects.toMatchObject({ status: 415 });
    }
    expect(() => videoMetadata({ format: { format_name: "mp4", duration: "1" }, streams: [] }, "mp4")).toThrow();
  });
  it("fails closed when binaries are missing or their version is incompatible", async () => {
    vi.stubEnv("MEDIA_FFPROBE_PATH", join(directory, "missing.exe"));
    await expect(inspectListingVideo(fixture("valid.mp4"))).rejects.toMatchObject({ status: 503, code: "MEDIA_VIDEO_UNAVAILABLE" });
    vi.unstubAllEnvs(); vi.stubEnv("MEDIA_VIDEO_BINARY_VERSION", "incompatible-version");
    await expect(inspectListingVideo(fixture("valid.mp4"))).rejects.toMatchObject({ status: 503 });
  });
  it("preserves image signature classification and rejects other BMFF brands and Matroska DocType", async () => {
    expect(videoSignature(Buffer.from([0xff, 0xd8, 0xff, 0, 102, 116, 121, 112]))).toBeNull();
    const bytes = await readFile(fixture("valid.mp4")); bytes.write("qt  ", 8); const path = join(directory, "mov"); await writeFile(path, bytes);
    await expect(inspectListingVideo(path)).rejects.toMatchObject({ status: 415 });
    const webm = await readFile(fixture("valid.webm")); webm.write("fake", webm.indexOf(Buffer.from("webm"))); await writeFile(path, webm);
    await expect(inspectListingVideo(path)).rejects.toMatchObject({ status: 415 });
  });
  it("does not confuse a WebM DocType byte sequence inside or after a Matroska header with its real DocType", () => {
    const magic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]); const webm = Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]);
    const matroska = Buffer.concat([Buffer.from([0x42, 0x82, 0x88]), Buffer.from("matroska")]);
    expect(webmHeader(Buffer.concat([magic, Buffer.from([0x80 + webm.length]), webm]))).toBe(true);
    expect(webmHeader(Buffer.concat([magic, Buffer.from([0x80 + matroska.length]), matroska, webm]))).toBe(false);
    const unknown = Buffer.concat([Buffer.from([0xec, 0x80 + webm.length]), webm]); const children = Buffer.concat([matroska, unknown]);
    expect(webmHeader(Buffer.concat([magic, Buffer.from([0x80 + children.length]), children]))).toBe(false);
    expect(webmHeader(Buffer.concat([magic, Buffer.from([0xff]), webm]))).toBe(false);
  });
  it("rejects missing/nonfinite/zero and inconsistent durations, extra streams and excessive pixels", () => {
    const stream = { codec_type: "video", codec_name: "h264", width: 32, height: 24 };
    for (const duration of [undefined, "NaN", "Infinity", "0", "-1"]) expect(() => videoMetadata({ format: { format_name: "mp4", duration }, streams: [stream] }, "mp4")).toThrow();
    expect(() => videoMetadata({ format: { format_name: "mp4", duration: "10" }, streams: [{ ...stream, duration: "1" }] }, "mp4")).toThrow();
    expect(() => videoMetadata({ format: { format_name: "mp4", duration: "1" }, streams: [{ ...stream, width: 10000, height: 10000 }] }, "mp4")).toThrow();
    expect(() => videoMetadata({ format: { format_name: "mp4", duration: "1" }, streams: [stream, { ...stream, codec_type: "attachment" }] }, "mp4")).toThrow();
    expect(() => videoMetadata({ format: { format_name: "matroska,webm", duration: "1" }, streams: [stream] }, "webm")).toThrow();
  });
});

describe("bounded direct child processes", () => {
  it("kills and reaps hung processes and supports cancellation", async () => {
    await expect(runVideoProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], 100)).rejects.toMatchObject({ status: 503 });
    const controller = new AbortController(); const pending = runVideoProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], 5000, controller.signal); controller.abort();
    await expect(pending).rejects.toMatchObject({ status: 503 });
  });
  it("rejects process crashes, stderr errors and excessive stdout/stderr without exposing diagnostics", async () => {
    for (const code of ["process.exit(2)", "console.error('sensitive diagnostic')", "process.stdout.write('x'.repeat(200000))", "process.stderr.write('x'.repeat(100000))"]) {
      await expect(runVideoProcess(process.execPath, ["-e", code], 5000)).rejects.toThrowError(expect.objectContaining({ message: expect.not.stringContaining("sensitive") }));
    }
  });
});
