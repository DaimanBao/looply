import { AppError } from "../../shared/errors/app-error";

/** Derives versioned server-owned renditions; legacy avatars still have one object. */
export function mediaObjectKeys(storageKey: string): string[] {
  if (!storageKey.startsWith("listing/v1/")) return [storageKey];
  return listingMediaObjectKeys(storageKey);
}

/** Validates the canonical server UUID key and returns a complete, statically known rendition set. */
export function listingMediaObjectKeys(storageKey: string): [string, string, string] {
  if (!/^listing\/v1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(storageKey)) {
    throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is unavailable.");
  }
  return [storageKey, storageKey.replace(/\.webp$/, ".thumbnail.webp"), storageKey.replace(/\.webp$/, ".complete")];
}
