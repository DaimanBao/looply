import type { Principal } from "./authenticated-user";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
    interface Locals {
      principal?: Principal;
      validated?: unknown;
    }
  }
}

export {};
