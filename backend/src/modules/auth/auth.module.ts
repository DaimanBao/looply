import type { PrismaClient } from "../../generated/prisma/client";
import type { AuthConfig } from "../../config/auth-config";
import { AuthRepository } from "./auth.repository";
import { AccessTokens } from "./security/access-tokens";
import { PwnedPasswordScreen } from "./security/password";
import { RedisStore } from "./redis/redis-store";
import { EphemeralAuth } from "./redis/ephemeral-auth";
import { SessionService } from "./sessions/session.service";
import { IdentityService } from "./identity/identity.service";
import { CredentialService } from "./credentials/credential.service";
import { OtpService } from "./otp/otp.service";
import { FakeMessageProvider, HttpMessageProvider } from "./providers/message-provider";
import { GoogleOidcVerifier } from "./providers/google-verifier";
import { createAuthController } from "./http/auth.controller";
import { createAuthRouter } from "./auth.routes";
import type { GoogleVerifier, MessageProvider, PasswordScreen } from "./auth.types";

export type AuthProviders = { sms: MessageProvider; email: MessageProvider; google: GoogleVerifier; passwords: PasswordScreen };
/** Refuses incomplete real gateways instead of relying on non-null assertions after configuration parsing. */
function messageProvider(kind: "fake" | "http", url?: string, key?: string): MessageProvider {
  if (kind === "fake") return new FakeMessageProvider();
  if (!url || !key) throw new Error("Missing message provider configuration");
  return new HttpMessageProvider(url, key);
}
/** Creates replaceable external providers without changing service logic between environments. */
export function createAuthProviders(config: AuthConfig): AuthProviders {
  if (config.environment === "production" && (config.SMS_PROVIDER === "fake" || config.EMAIL_PROVIDER === "fake")) throw new Error("Production refuses fake message providers");
  return {
    sms: messageProvider(config.SMS_PROVIDER, config.SMS_PROVIDER_URL, config.SMS_PROVIDER_KEY),
    email: messageProvider(config.EMAIL_PROVIDER, config.EMAIL_PROVIDER_URL, config.EMAIL_PROVIDER_KEY),
    google: new GoogleOidcVerifier(config.GOOGLE_CLIENT_ID), passwords: new PwnedPasswordScreen(),
  };
}
/** Composes explicit module dependencies; resource connection remains owned by startup/shutdown. */
export function createAuthModule(db: PrismaClient, config: AuthConfig, providers: AuthProviders = createAuthProviders(config), redis = new RedisStore(config.REDIS_URL), namespace = "looply:auth:") {
  const repository = new AuthRepository(db);
  const ephemeral = new EphemeralAuth(redis, config.AUTH_OTP_PEPPER, namespace, {
    ip: { maximum: config.AUTH_IP_LIMIT, seconds: config.AUTH_IP_WINDOW_SECONDS },
    password: { maximum: config.AUTH_PASSWORD_LIMIT, seconds: config.AUTH_PASSWORD_WINDOW_SECONDS },
    reauth: { maximum: config.AUTH_REAUTH_LIMIT, seconds: config.AUTH_REAUTH_WINDOW_SECONDS },
  });
  const sessions = new SessionService(repository, new AccessTokens(config.AUTH_JWT_SECRET, config.AUTH_ISSUER));
  const identity = new IdentityService(repository, sessions, ephemeral, providers.google, providers.passwords);
  const credentials = new CredentialService(repository, sessions, identity, ephemeral, providers.passwords);
  const otp = new OtpService(repository, ephemeral, providers.sms, providers.email);
  const authRouter = createAuthRouter(createAuthController(identity, sessions, credentials, otp, config.environment === "production"), sessions, ephemeral, config.origins);
  return { repository, ephemeral, sessions, identity, credentials, otp, redis, providers, routers: [authRouter] };
}
