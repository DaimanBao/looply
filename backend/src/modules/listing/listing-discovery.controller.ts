import type { RequestHandler } from "express";
import { z } from "zod";
import { principal } from "../auth";
import type { ListingDiscoveryService } from "./listing-discovery.service";
import type { ListingFollowService } from "./listing-follow.service";
import { discoveryValuesSchema, pageValuesSchema, suggestionsSchema } from "./listing-discovery.schema";
import { listingId } from "./listing.schema";

/** Connects HTTP to discovery and relationship services; validation and authorization remain separate. */
export function createListingDiscoveryController(discovery: ListingDiscoveryService, follows: ListingFollowService) {
  /** Returns the requested search/nearby/national page without guessing profile location. */
  const search: RequestHandler = async (_request, response) => { const input = z.object({ query: discoveryValuesSchema }).parse(response.locals.validated); response.json(await discovery.page(input.query, "discovery", response.locals.principal)); };
  /** Returns lightweight title matches only. */
  const suggestions: RequestHandler = async (_request, response) => { const input = z.object({ query: suggestionsSchema }).parse(response.locals.validated); response.json(await discovery.suggestions(input.query.q, response.locals.principal)); };
  /** Uses Listing creation order, rather than relationship creation order, for followed pages. */
  const followed: RequestHandler = async (_request, response) => { const input = z.object({ query: pageValuesSchema }).parse(response.locals.validated); response.json(await discovery.page(input.query, "followed", principal(response))); };
  /** Restricts a public-user page to that target and never returns its HIDDEN listings. */
  const userListings: RequestHandler = async (_request, response) => { const input = z.object({ params: z.object({ userId: listingId }), query: pageValuesSchema }).parse(response.locals.validated); response.json(await discovery.page(input.query, `user:${input.params.userId}`, response.locals.principal)); };
  /** PUT remains bodyless and idempotent for an eligible Listing. */
  const follow: RequestHandler = async (request, response) => { await follows.follow(listingId.parse(request.params.listingId), principal(response)); response.status(204).end(); };
  /** DELETE discloses neither foreign visibility nor existence. */
  const unfollow: RequestHandler = async (request, response) => { await follows.unfollow(listingId.parse(request.params.listingId), principal(response)); response.status(204).end(); };
  return { search, suggestions, followed, userListings, follow, unfollow };
}
