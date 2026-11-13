import { validateRequest } from "../../shared/middleware/validate-request";
import { z } from "zod";

export const validateMediaId = validateRequest(z.object({ params: z.object({ mediaId: z.uuid() }), body: z.unknown(), query: z.unknown() }));
