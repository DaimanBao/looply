import { z } from "zod";

export const listingId = z.uuid().transform((id) => id.toLowerCase());
const version = z.number().int().min(1).max(2147483647);
const price = z.string().regex(/^[1-9][0-9]{0,14}$/).nullable();
const rentalUnit = z.enum(["DAY", "MONTH"]).nullable();
/** Matches PostgreSQL btrim/char_length without stripping other Unicode whitespace. */
function text(min: number, max: number) { return z.string().transform((value) => value.replace(/^ +| +$/g, "")).refine((value) => [...value].length >= min && [...value].length <= max, "Invalid text length"); }
export const manifestSchema = z.strictObject({ imageIds: z.array(listingId).min(1).max(5), coverImageId: listingId.optional(), videoId: listingId.nullable() }).superRefine((value, context) => {
  if (new Set(value.imageIds).size !== value.imageIds.length || (value.videoId && value.imageIds.includes(value.videoId))) context.addIssue({ code: "custom", path: ["imageIds"], message: "Duplicate media" });
  if (value.coverImageId && !value.imageIds.includes(value.coverImageId)) context.addIssue({ code: "custom", path: ["coverImageId"], message: "Cover must be a gallery image" });
});
const fields = { title: text(10, 150), description: text(20, 5000), type: z.enum(["SALE", "RENT", "EXCHANGE"]), price, rentalUnit, provinceCode: z.string().min(1).max(32), contactPhone: z.string().regex(/^\+[1-9][0-9]{7,14}$/).max(20).nullable().optional(), media: manifestSchema };
/** Validates the final merged transaction values without converting Decimal to a JS number. */
export function validTerms(value: { type: string; price: string | null; rentalUnit: string | null }): boolean {
  return value.type === "EXCHANGE" ? value.price === null && value.rentalUnit === null : value.price !== null && /^[1-9][0-9]{0,14}$/.test(value.price) && (value.type === "RENT" ? value.rentalUnit === "DAY" || value.rentalUnit === "MONTH" : value.rentalUnit === null);
}
export const createListingSchema = z.strictObject(fields).refine(validTerms, { path: ["price"], message: "Invalid price/rental unit" });
export const patchListingSchema = z.strictObject({ ...z.strictObject(fields).partial().shape, expectedVersion: version, confirmConversationImpact: z.boolean().optional() }).refine((value) => Object.keys(fields).some((key) => Object.hasOwn(value, key)), "At least one mutable field is required");
export const visibilitySchema = z.strictObject({ status: z.enum(["ACTIVE", "HIDDEN"]), expectedVersion: version, confirmReopenAfterAccepted: z.boolean().optional() });
export const deleteListingSchema = z.strictObject({ expectedVersion: version, confirmDelete: z.literal(true) });
export const myListingsInput = z.strictObject({ status: z.enum(["ACTIVE", "HIDDEN"]).optional(), limit: z.number().int().min(1).max(48), after: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional() });
export const myListingsSchema = myListingsInput.extend({ limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(48)).default(12) });
export type ListingCreate = z.infer<typeof createListingSchema>;
export type ListingPatch = z.infer<typeof patchListingSchema>;
export type ListingManifest = z.infer<typeof manifestSchema>;
export type MyListingsQuery = z.infer<typeof myListingsSchema>;
