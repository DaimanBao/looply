import { AppError } from "../../shared/errors/app-error";

/** Returns the same public failure for unknown accounts, credentials and expired/revoked sessions. */
export function unauthorized(): AppError { return new AppError(401, "UNAUTHENTICATED", "Authentication failed."); }
/** Rejects state or authorization violations without disclosing internal data. */
export function forbidden(): AppError { return new AppError(403, "FORBIDDEN", "This operation is not permitted."); }
/** Marks external security dependencies unavailable; callers must fail closed. */
export function unavailable(): AppError { return new AppError(503, "AUTH_UNAVAILABLE", "Authentication is temporarily unavailable."); }
/** Reports invalid or conflicting account input through the shared public error contract. */
export function conflict(message: string): AppError { return new AppError(409, "ACCOUNT_CONFLICT", message); }
