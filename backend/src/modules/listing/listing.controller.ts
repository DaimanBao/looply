import type { RequestHandler } from "express";
import type { ListingService } from "./listing.service";
import { principal } from "../auth";
import { body } from "../../shared/http/validated-body";
import { createListingSchema, patchListingSchema, visibilitySchema, deleteListingSchema, listingId, myListingsInput } from "./listing.schema";
import { z } from "zod";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AppError } from "../../shared/errors/app-error";

/** Maps validated HTTP inputs to domain operations; all policy remains in the service. */
export function createListingController(service: ListingService) {
  /** Creates and returns the committed resource and its detail Location. */
  const create: RequestHandler = async (_request, response) => { const result = await service.create(principal(response), body(response, createListingSchema)); response.location(`/api/listings/${result.id}`).status(201).json(result); };
  /** Uses optional identity without falling back from invalid credentials to guest access. */
  const get: RequestHandler = async (request, response) => { response.json(await service.get(listingId.parse(request.params.listingId), response.locals.principal)); };
  /** Reads transformed pagination values without parsing HTTP string inputs a second time. */
  const mine: RequestHandler = async (_request, response) => { const input = z.object({ query: myListingsInput }).parse(response.locals.validated); response.json(await service.mine(principal(response), input.query)); };
  /** Delegates an owner edit using only explicitly validated mutable fields. */
  const update: RequestHandler = async (request, response) => { response.json(await service.update(listingId.parse(request.params.listingId), principal(response), body(response, patchListingSchema))); };
  /** Delegates an optimistic hide/reopen transition. */
  const visibility: RequestHandler = async (request, response) => { response.json(await service.visibility(listingId.parse(request.params.listingId), principal(response), body(response, visibilitySchema))); };
  /** Returns no body for terminal deletion and valid idempotent retries. */
  const remove: RequestHandler = async (request, response) => { await service.remove(listingId.parse(request.params.listingId), principal(response), body(response, deleteListingSchema).expectedVersion); response.status(204).end(); };
  /** Sends private bytes only after service authorization has completed. */
  const delivery: RequestHandler = async (request, response) => {
    const input = z.object({ params: z.object({ listingId, mediaId: listingId }), query: z.object({ variant: z.enum(["detail", "thumbnail", "original"]).optional() }) }).parse(response.locals.validated);
    const result = await service.delivery({ ...input.params, variant: input.query.variant, range: request.method === "HEAD" ? undefined : request.headers.range, ifRange: request.headers["if-range"] !== undefined }, response.locals.principal);
    if (result.body instanceof Readable && (result.body.destroyed || result.body.errored)) throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is temporarily unavailable.");
    response.set("Accept-Ranges", result.acceptRanges);
    if (result.contentRange) response.set("Content-Range", result.contentRange);
    if (result.status === 416) throw new AppError(416, "INVALID_RANGE", "Choose a satisfiable single byte range.");
    response.status(result.status).type(result.mimeType).set("Content-Length", String(result.length));
    if (request.method === "HEAD") { if (result.body instanceof Readable) result.body.destroy(); response.end(); return; }
    if (result.body instanceof Readable) {
      // No database lock is retained during playback; immutable storage preserves the opened byte stream.
      const timer = setTimeout(() => { if (result.body instanceof Readable) result.body.destroy(); response.destroy(); }, 120000);
      try { await pipeline(result.body, response); } catch { response.destroy(); } finally { clearTimeout(timer); }
    } else response.send(result.body);
  };
  return { create, get, mine, update, visibility, remove, delivery };
}
