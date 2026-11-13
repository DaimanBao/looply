import type { RequestHandler } from "express";
import type { DeletionService } from "./deletion.service";
import { principal } from "../../auth";
import { body } from "../../../shared/http/validated-body";
import { reauthProofSchema } from "../../auth";
import { clearRefresh } from "../../auth";

/** Exposes explicit deletion/cancellation operations without embedding lifecycle logic in HTTP handlers. */
export function createDeletionController(deletion: DeletionService, secure: boolean) {
  /** Schedules deletion and removes the browser refresh cookie. */
  const request: RequestHandler = async (_request, response) => { await deletion.request(principal(response), body(response, reauthProofSchema).reauthProof); clearRefresh(response, secure); response.status(202).end(); };
  /** Cancels deletion only through an explicit authenticated request. */
  const cancel: RequestHandler = async (_request, response) => { await deletion.cancel(principal(response)); response.sendStatus(204); };
  return { request, cancel };
}
