import type { UserStatus } from "../../generated/prisma/client";

export type Principal = { userId: string; sessionId: string; status: UserStatus };
