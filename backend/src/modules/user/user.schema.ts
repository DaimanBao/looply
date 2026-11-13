import { z } from "zod";
import { usernameSchema } from "./username";

const displayName = z.string().refine((value) => [...value].length >= 1 && [...value].length <= 60);
export const profileSchema = z.object({ displayName: displayName.optional(), bio: z.string().refine((value) => [...value].length <= 300).nullable().optional(), provinceCode: z.string().min(1).max(32).optional() }).strict().refine((value) => Object.keys(value).length > 0);
export const changeUsernameSchema = z.object({ username: usernameSchema }).strict();
export const userIdSchema = z.object({ userId: z.uuid().transform((id) => id.toLowerCase()) });
export const pageSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), after: z.uuid().optional() });
