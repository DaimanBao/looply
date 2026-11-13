import { z } from "zod";

export const usernameSchema = z
  .string()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,30}$/);
