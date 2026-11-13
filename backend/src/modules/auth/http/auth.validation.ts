import { z } from "zod";
import { validateRequest } from "../../../shared/middleware/validate-request";

export const validateSessionId = validateRequest(z.object({ params: z.object({ sessionId: z.uuid() }), query: z.unknown(), body: z.unknown() }));
