import { AppError } from "../../shared/errors/app-error";

/** Suy ra các bản có phiên bản do server quản lý; avatar cũ vẫn có một object. */
export function mediaObjectKeys(storageKey: string): string[] {
  if (!storageKey.startsWith("listing/v1/")) return [storageKey];
  if (/\.(mp4|webm)$/.test(storageKey)) return videoObjectKeys(storageKey);
  return listingMediaObjectKeys(storageKey);
}

/** Giữ video gốc và dấu hoàn tất trong một đơn vị cleanup bất biến. */
export function videoObjectKeys(key: string): [string, string] {
  if (
    !/^listing\/v1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm)$/.test(
      key,
    )
  )
    throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is unavailable.");
  return [key, `${key}.complete`];
}

/** Kiểm tra khóa UUID server chuẩn và trả tập bản chuyển đổi đầy đủ, biết trước kiểu tĩnh. */
export function listingMediaObjectKeys(storageKey: string): [string, string, string] {
  if (
    !/^listing\/v1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(
      storageKey,
    )
  ) {
    throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is unavailable.");
  }
  return [
    storageKey,
    storageKey.replace(/\.webp$/, ".thumbnail.webp"),
    storageKey.replace(/\.webp$/, ".complete"),
  ];
}
