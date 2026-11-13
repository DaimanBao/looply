import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { optimizeListingImage } from "./listing-image";

describe("Listing image processor", () => {
  it("does not classify a valid JPEG APP segment as an unavailable video", async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } })
      .jpeg()
      .toBuffer();
    // Độ dài APP15 và hai byte payload đầu trùng vị trí ftyp của BMFF.
    const app = Buffer.alloc(0x6674 + 2);
    app[0] = 0xff;
    app[1] = 0xef;
    app.writeUInt16BE(0x6674, 2);
    app[4] = 0x79;
    app[5] = 0x70;
    const input = Buffer.concat([jpeg.subarray(0, 2), app, jpeg.subarray(2)]);
    expect(input.subarray(4, 8).toString("ascii")).toBe("ftyp");
    expect((await sharp(input).metadata()).format).toBe("jpeg");
    const output = await optimizeListingImage(input);
    expect((await sharp(output.detail).metadata()).format).toBe("webp");
    expect((await sharp(output.thumbnail).metadata()).format).toBe("webp");
  });
  it("creates proportional detail and thumbnail WebP without preserving private metadata", async () => {
    const input = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: "#cc8844" },
    })
      .png()
      .withMetadata({ exif: { IFD0: { Artist: "Private fixture owner" } } })
      .toBuffer();
    const output = await optimizeListingImage(input);
    const detail = await sharp(output.detail).metadata();
    const thumbnail = await sharp(output.thumbnail).metadata();
    expect(detail).toMatchObject({ width: 1600, height: 800, format: "webp" });
    expect(thumbnail).toMatchObject({ width: 400, height: 200, format: "webp" });
    expect(detail.exif).toBeUndefined();
    expect(thumbnail.exif).toBeUndefined();
    expect(output.detail.length).toBeLessThan(input.length);
  });
  it("rejects GIF, spoofed/truncated files and recognized videos without accepting client metadata", async () => {
    const gif = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } })
      .gif()
      .toBuffer();
    for (const bytes of [gif, Buffer.from("image/png"), Buffer.from([137, 80, 78, 71])])
      await expect(optimizeListingImage(bytes)).rejects.toMatchObject({ status: 415 });
    await expect(optimizeListingImage(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))).rejects.toMatchObject(
      { status: 503, code: "MEDIA_VIDEO_UNAVAILABLE" },
    );
  });
});
