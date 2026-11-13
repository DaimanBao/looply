import { z } from "zod";
import { otpPurposes, sensitiveOperations } from "./auth.types";
import { usernameSchema } from "../user/username";
export { usernameSchema } from "../user/username";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const phoneSchema = z.string().regex(/^\+[1-9][0-9]{7,14}$/);
export const passwordSchema = z
  .string()
  .refine((value) => [...value].length >= 8 && [...value].length <= 128);
export const otpProofSchema = z.object({
  challengeId: z.uuid(),
  code: z.string().regex(/^[0-9]{6}$/),
});
export const registerSchema = otpProofSchema
  .extend({
    username: usernameSchema,
    password: passwordSchema,
    phone: phoneSchema,
    provinceCode: z.string().min(1).max(32),
    email: emailSchema.optional(),
  })
  .strict();
export const passwordLoginSchema = z
  .object({ username: usernameSchema, password: z.string().max(512) })
  .strict();
export const phoneLoginSchema = otpProofSchema.extend({ phone: phoneSchema }).strict();
export const googleSchema = z
  .object({ credential: z.string().min(1).max(16384), challengeId: z.string().min(40).max(128) })
  .strict();
export const requestOtpSchema = z
  .object({ purpose: z.enum(otpPurposes), destination: z.string().max(254) })
  .strict();
export const reauthSchema = z
  .object({
    operation: z.enum(sensitiveOperations),
    password: z.string().max(512).optional(),
    challengeId: z.string().min(1).max(128).optional(),
    code: z
      .string()
      .regex(/^[0-9]{6}$/)
      .optional(),
    credential: z.string().max(16384).optional(),
  })
  .strict();
export const resetSchema = otpProofSchema
  .extend({ destination: z.string().max(254), password: passwordSchema })
  .strict();
export const changePasswordSchema = z
  .object({ password: passwordSchema, reauthProof: z.string().min(40).max(128) })
  .strict();
export const changeContactSchema = otpProofSchema
  .extend({ destination: z.string().max(254), reauthProof: z.string().min(40).max(128) })
  .strict();
export const reauthProofSchema = z.object({ reauthProof: z.string().min(40).max(128) }).strict();
