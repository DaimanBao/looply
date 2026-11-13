import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { ListingApi } from '../data-access/listing.api';
import { INITIAL_FILTERS, discoveryQuery } from '../models/discovery-query';
import type { ListingPage } from '../models/listing.models';
import { DiscoveryStore } from './discovery.store';
import { listingFixture } from '../testing/listing.fixture';

describe('DiscoveryStore pagination', () => {
  const query = discoveryQuery(INITIAL_FILTERS).query!;
  let requests: Subject<ListingPage>[];
  let api: { discover: ReturnType<typeof vi.fn> };
  let store: DiscoveryStore;
  beforeEach(() => {
    requests = [];
    api = {
      discover: vi.fn(() => {
        const request = new Subject<ListingPage>();
        requests.push(request);
        return request;
      }),
    };
    TestBed.configureTestingModule({
      providers: [DiscoveryStore, { provide: ListingApi, useValue: api }],
    });
    store = TestBed.inject(DiscoveryStore);
  });
  it('guards duplicate requests, deduplicates IDs and stops at the end', () => {
    store.reset(query);
    store.loadMore();
    expect(api.discover).toHaveBeenCalledTimes(1);
    requests[0].next({ data: [listingFixture()], pagination: { nextCursor: 'seed_cursor' } });
    store.loadMore();
    expect(api.discover).toHaveBeenLastCalledWith(query, 'seed_cursor');
    requests[1].next({
      data: [listingFixture(), listingFixture({ id: '00000000-0000-4000-8000-000000000002' })],
      pagination: { nextCursor: null },
    });
    expect(store.items()).toHaveLength(2);
    store.loadMore();
    expect(api.discover).toHaveBeenCalledTimes(2);
  });
  it('cancels the previous query and resets all data/cursors for a different tab or query', () => {
    store.reset(query);
    requests[0].next({ data: [listingFixture()], pagination: { nextCursor: 'old' } });
    store.loadMore();
    const next = { ...query, feed: 'nearby' as const, provinceCode: '79', sort: 'NEWEST' as const };
    store.reset(next);
    requests[1].next({ data: [listingFixture()], pagination: { nextCursor: 'stale' } });
    expect(requests[1].observed).toBe(false);
    expect(store.items()).toEqual([]);
    expect(api.discover).toHaveBeenLastCalledWith(next, undefined);
    requests[2].next({ data: [], pagination: { nextCursor: null } });
    expect(store.cursor()).toBeNull();
  });
  it('retains the same cursor after failure for an explicit retry', () => {
    store.reset(query);
    requests[0].next({ data: [listingFixture()], pagination: { nextCursor: 'retry_cursor' } });
    store.loadMore();
    requests[1].error(new Error('network'));
    expect(store.error()).not.toBe('');
    expect(store.items()).toHaveLength(1);
    expect(store.loading()).toBe(false);
    store.loadMore();
    expect(api.discover).toHaveBeenLastCalledWith(query, 'retry_cursor');
  });
});
