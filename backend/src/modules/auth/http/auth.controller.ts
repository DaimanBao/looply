import type { RequestHandler } from "express";
import { z } from "zod";
import type { IdentityService } from "../identity/identity.service";
import type { SessionService } from "../sessions/session.service";
import type { CredentialService } from "../credentials/credential.service";
import type { OtpService } from "../otp/otp.service";
import { registerSchema, passwordLoginSchema, phoneLoginSchema, googleSchema, requestOtpSchema, reauthSchema, resetSchema } from "../auth.schema";
import { principal } from "./auth.middleware";
import { body } from "../../../shared/http/validated-body";
import { sessionResponse, refreshCookie, clearRefresh } from "./auth.cookies";

export const linkGoogleSchema = googleSchema.extend({ reauthProof: z.string().min(40).max(128) }).strict();
export type AuthController = ReturnType<typeof createAuthController>;

/** Translates HTTP boundaries only; all credential/session business rules stay in services. */
export function createAuthController(identity: IdentityService, sessions: SessionService, credentials: CredentialService, otp: OtpService, secure: boolean) {
  /** Returns tokens only after verified registration commits. */
  const register: RequestHandler = async (_request, response) => { sessionResponse(response, await identity.register(body(response, registerSchema)), secure, 201); };
  /** Sets the refresh cookie after password authentication. */
  const passwordLogin: RequestHandler = async (_request, response) => { sessionResponse(response, await identity.passwordLogin(body(response, passwordLoginSchema)), secure); };
  /** Exchanges a verified phone code for a session. */
  const phoneLogin: RequestHandler = async (_request, response) => { sessionResponse(response, await identity.phoneLogin(body(response, phoneLoginSchema)), secure); };
  /** Exchanges a verified provider identity for a session. */
  const googleLogin: RequestHandler = async (_request, response) => { sessionResponse(response, await identity.googleLogin(body(response, googleSchema)), secure); };
  /** Returns a fresh nonce bound to the optional current session. */
  const googleChallenge: RequestHandler = async (_request, response) => { response.json(await identity.challenge(response.locals.principal)); };
  /** Consumes linking authorization without exposing provider data. */
  const googleLink: RequestHandler = async (_request, response) => { await identity.link(principal(response), body(response, linkGoogleSchema)); response.sendStatus(204); };
  /** Returns challenge metadata only, never the delivered code. */
  const requestOtp: RequestHandler = async (_request, response) => { response.status(202).json(await otp.request(body(response, requestOtpSchema), response.locals.principal)); };
  /** Rotates the cookie while keeping its bearer value out of JSON. */
  const refresh: RequestHandler = async (request, response) => { sessionResponse(response, await sessions.refresh(refreshCookie(request)), secure); };
  /** Revokes the cookie session and expires its browser cookie. */
  const logout: RequestHandler = async (request, response) => { await sessions.logout(refreshCookie(request)); clearRefresh(response, secure); response.sendStatus(204); };
  /** Returns a short-lived proof with caching disabled. */
  const reauthenticate: RequestHandler = async (_request, response) => { response.setHeader("Cache-Control", "no-store"); response.json(await credentials.reauthenticate(principal(response), body(response, reauthSchema))); };
  /** Completes recovery and clears any obsolete browser refresh cookie. */
  const reset: RequestHandler = async (_request, response) => { await credentials.resetPassword(body(response, resetSchema)); clearRefresh(response, secure); response.sendStatus(204); };
  /** Returns safe session metadata for the owner. */
  const list: RequestHandler = async (_request, response) => { response.json(await sessions.list(principal(response))); };
  /** Deletes authority only for a caller-owned session identifier. */
  const revoke: RequestHandler = async (request, response) => { await sessions.revoke(principal(response), z.uuid().parse(request.params.sessionId)); response.sendStatus(204); };
  return { register, passwordLogin, phoneLogin, googleLogin, googleChallenge, googleLink, requestOtp, refresh, logout, reauthenticate, reset, list, revoke };
}
