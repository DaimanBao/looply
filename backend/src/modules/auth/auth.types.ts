import type { UserStatus } from "../../generated/prisma/client";

export type { Principal } from "../../shared/types/authenticated-user";
export const sensitiveOperations = ["CHANGE_PASSWORD", "CHANGE_EMAIL", "CHANGE_PHONE", "LINK_GOOGLE", "DELETE_ACCOUNT"] as const;
export type SensitiveOperation = typeof sensitiveOperations[number];
export const otpPurposes = ["REGISTER_PHONE", "LOGIN_PHONE", "CHANGE_PHONE", "VERIFY_EMAIL", "RESET_PASSWORD", "REAUTH_PHONE"] as const;
export type OtpPurpose = typeof otpPurposes[number];
export type OtpBinding = { purpose: OtpPurpose; destination: string; userId?: string; sessionId?: string };
export type GoogleIdentity = { subject: string; email?: string; verified: boolean; name?: string };
export type IssuedSession = { accessToken: string; expiresIn: number; refreshToken: string; status: UserStatus };
export interface MessageProvider { send(destination: string, code: string): Promise<void>; }
export interface GoogleVerifier { verify(credential: string, nonce: string): Promise<GoogleIdentity>; }
export interface PasswordScreen { check(password: string): Promise<void>; }
export type AuthLimits = { ip: { maximum: number; seconds: number }; password: { maximum: number; seconds: number }; reauth: { maximum: number; seconds: number } };
