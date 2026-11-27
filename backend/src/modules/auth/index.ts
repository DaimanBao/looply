export { SessionService, authSessionLifetimeSeconds } from "./session.service";
export { CredentialService } from "./credential.service";
export type { Principal } from "./auth.types";
export { authenticate } from "./http/auth.middleware";
export { principal } from "./http/auth.middleware";
export { reauthProofSchema, changeContactSchema, changePasswordSchema } from "./auth.schema";
export { clearRefresh } from "./http/auth.cookies";
export { conflict, forbidden } from "./auth.errors";
export type { ScriptStore } from "./redis/redis-store";
