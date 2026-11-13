/** Keeps stored titles and discovery queries on the same canonical Vietnamese search representation. */
export function normalizeListingTitle(title: string): string {
  return title.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().trim().replace(/\s+/gu, " ");
}
