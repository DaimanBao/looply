import { z } from "zod";
import { validateRequest } from "../../../shared/middleware/validate-request";
import { userIdSchema, pageSchema } from "../user.schema";

export const validateUserId = validateRequest(
  z.object({ params: userIdSchema, query: z.unknown(), body: z.unknown() }),
);
export const validatePage = validateRequest(
  z.object({ params: z.unknown(), query: pageSchema, body: z.unknown() }),
);
