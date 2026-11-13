import type { RequestHandler } from "express";
import { userIdSchema } from "../user.schema";
import type { UserService } from "../user.service";
import type { CredentialService } from "../../auth";
import { profileSchema, changeUsernameSchema, pageSchema } from "../user.schema";
import { changePasswordSchema, changeContactSchema } from "../../auth";
import { principal } from "../../auth";
import { body } from "../../../shared/http/validated-body";

/** Owns HTTP serialization while User/Auth services retain all mutation and authorization rules. */
export function createUserController(users: UserService, credentials: CredentialService) {
  /** Returns private data only through the owner-specific projection. */
  const me: RequestHandler = async (_request, response) => { response.setHeader("Cache-Control", "no-store"); response.json(await users.me(principal(response))); };
  /** Passes the validated profile patch to the owner-authorized service. */
  const update: RequestHandler = async (_request, response) => { response.json(await users.update(principal(response), body(response, profileSchema))); };
  /** Returns the updated owner profile after the cooldown check. */
  const username: RequestHandler = async (_request, response) => { response.json(await users.username(principal(response), body(response, changeUsernameSchema).username)); };
  /** Applies an email-specific proof and code without exposing credentials. */
  const email: RequestHandler = async (_request, response) => { await credentials.changeContact(principal(response), "email", body(response, changeContactSchema)); response.sendStatus(204); };
  /** Applies a phone-specific proof and code without exposing credentials. */
  const phone: RequestHandler = async (_request, response) => { await credentials.changeContact(principal(response), "phone", body(response, changeContactSchema)); response.sendStatus(204); };
  /** Changes credentials without returning password or refresh material. */
  const password: RequestHandler = async (_request, response) => { await credentials.changePassword(principal(response), body(response, changePasswordSchema)); response.sendStatus(204); };
  /** Publishes the active reference catalog. */
  const provinces: RequestHandler = async (_request, response) => { response.json(await users.provinces()); };
  /** Uses the block-aware public projection for optional viewers. */
  const profile: RequestHandler = async (request, response) => { response.setHeader("Cache-Control", "no-store"); response.json(await users.profile(userIdSchema.parse(request.params).userId, response.locals.principal)); };
  /** Returns a bounded page of public follower profiles. */
  const followers: RequestHandler = async (request, response) => { response.json(await users.related(userIdSchema.parse(request.params).userId, "followers", pageSchema.parse(request.query), response.locals.principal)); };
  /** Returns a bounded page of public followed profiles. */
  const following: RequestHandler = async (request, response) => { response.json(await users.related(userIdSchema.parse(request.params).userId, "following", pageSchema.parse(request.query), response.locals.principal)); };
  /** Returns only the current owner?s block list. */
  const blocked: RequestHandler = async (request, response) => { const actor = principal(response); response.json(await users.related(actor.userId, "blocked", pageSchema.parse(request.query), actor)); };
  /** Creates the caller?s directional Follow idempotently. */
  const follow: RequestHandler = async (request, response) => { await users.relationship(principal(response), userIdSchema.parse(request.params).userId, "follow"); response.sendStatus(204); };
  /** Removes only the caller?s directional Follow. */
  const unfollow: RequestHandler = async (request, response) => { await users.relationship(principal(response), userIdSchema.parse(request.params).userId, "unfollow"); response.sendStatus(204); };
  /** Delegates bidirectional interaction protection and Follow cleanup. */
  const block: RequestHandler = async (request, response) => { await users.relationship(principal(response), userIdSchema.parse(request.params).userId, "block"); response.sendStatus(204); };
  /** Removes only the caller?s Block without restoring Follow. */
  const unblock: RequestHandler = async (request, response) => { await users.relationship(principal(response), userIdSchema.parse(request.params).userId, "unblock"); response.sendStatus(204); };
  return { me, update, username, email, phone, password, provinces, profile, followers, following, blocked, follow, unfollow, block, unblock };
}
