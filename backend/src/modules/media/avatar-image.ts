import sharp from "sharp";
import { AppError } from "../../shared/errors/app-error";

/** Decodes actual image contents, bounds decompression, strips metadata and creates an optimized avatar. */
export async function optimizeAvatar(input: Buffer): Promise<Buffer> {
  if (!Buffer.isBuffer(input) || input.length === 0 || input.length > 10 * 1024 * 1024) throw new AppError(400, "INVALID_AVATAR", "Choose an image up to 10 MiB.");
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
    return await image.rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { throw new AppError(400, "INVALID_AVATAR", "Choose a valid JPEG, PNG or WebP image."); }
}
