/** Keeps persisted searchTitle consistent with the approved future discovery algorithm. */
export function normalizeListingTitle(title: string): string {
  return title.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().trim().replace(/\s+/gu, " ");
}
