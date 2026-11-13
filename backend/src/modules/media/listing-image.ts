import sharp from "sharp";
import { AppError } from "../../shared/errors/app-error";

export const listingImageConfig = {
  maxInputBytes: 10 * 1024 * 1024,
  maxPixels: 40_000_000,
  detailEdge: 1600,
  thumbnailEdge: 400,
  quality: 85,
  processingSeconds: 15,
};
/** Loại chữ ký JPEG trước nhận diện BMFF: độ dài/payload JPEG APP cũng có thể tạo chuỗi ftyp. */
function isVideo(input: Buffer): boolean {
  if (input.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return false;
  return (
    input.subarray(4, 8).toString("ascii") === "ftyp" ||
    input.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  );
}
/** Giải mã pixel thực với giới hạn giải nén, loại metadata và tạo cả hai bản WebP bất biến. */
export async function optimizeListingImage(
  input: Buffer,
): Promise<{ detail: Buffer; thumbnail: Buffer }> {
  if (isVideo(input))
    throw new AppError(503, "MEDIA_VIDEO_UNAVAILABLE", "Video uploads are not available yet.");
  if (input.length > listingImageConfig.maxInputBytes)
    throw new AppError(413, "PAYLOAD_TOO_LARGE", "Choose an image up to 10 MiB.");
  try {
    const image = sharp(input, {
      limitInputPixels: listingImageConfig.maxPixels,
      failOn: "warning",
      animated: true,
    });
    const metadata = await image.metadata();
    if (
      !metadata.format ||
      !["jpeg", "png", "webp"].includes(metadata.format) ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error("Unsupported image");
    const base = image.rotate();
    const detail = await base
      .clone()
      .resize(listingImageConfig.detailEdge, listingImageConfig.detailEdge, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: listingImageConfig.quality })
      .timeout({ seconds: listingImageConfig.processingSeconds })
      .toBuffer();
    const thumbnail = await base
      .clone()
      .resize(listingImageConfig.thumbnailEdge, listingImageConfig.thumbnailEdge, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: listingImageConfig.quality })
      .timeout({ seconds: listingImageConfig.processingSeconds })
      .toBuffer();
    return { detail, thumbnail };
  } catch {
    throw new AppError(415, "UNSUPPORTED_MEDIA", "Choose a valid JPEG, PNG or WebP image.");
  }
}
