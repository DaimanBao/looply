import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ListingManagementApi } from './listing-management.api';
import { listingFixture } from '../testing/listing.fixture';
import type { ListingInput } from '../models/listing-management.models';

describe('Listing management HTTP contract', () => {
  let api: ListingManagementApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ListingManagementApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('accepts own hidden rows but rejects foreign rows and deleted listings', () => {
    const listing = listingFixture({ status: 'HIDDEN' });
    let count = 0;
    api.mine(listing.owner.id, 'HIDDEN', 'opaque').subscribe((page) => (count = page.data.length));
    const request = http.expectOne('/api/users/me/listings?limit=12&status=HIDDEN&after=opaque');
    request.flush({ data: [listing], pagination: { nextCursor: null } });
    expect(count).toBe(1);
    for (const row of [
      listingFixture({ status: 'DELETED' }),
      listingFixture({ owner: { ...listing.owner, id: '00000000-0000-4000-8000-000000000088' } }),
    ]) {
      let rejected = false;
      api.mine(listing.owner.id, '').subscribe({ error: () => (rejected = true) });
      http
        .expectOne('/api/users/me/listings?limit=12')
        .flush({ data: [row], pagination: { nextCursor: null } });
      expect(rejected).toBe(true);
    }
  });

  it('uses exact mutation methods, final manifest, versions and confirmation bodies', () => {
    const listing = listingFixture();
    const input: ListingInput = {
      title: listing.title,
      description: listing.description,
      type: 'SALE',
      price: '100',
      rentalUnit: null,
      provinceCode: '79',
      contactPhone: null,
      media: { imageIds: [listing.cover.id], coverImageId: listing.cover.id, videoId: null },
    };
    api.create(input).subscribe();
    const create = http.expectOne('/api/listings');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(input);
    create.flush(listing);
    api.update(listing.id, input, 1, true).subscribe();
    const patch = http.expectOne(`/api/listings/${listing.id}`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({
      ...input,
      expectedVersion: 1,
      confirmConversationImpact: true,
    });
    patch.flush(listing);
    api.visibility(listing.id, 2, 'ACTIVE', true).subscribe();
    const visibility = http.expectOne(`/api/listings/${listing.id}/visibility`);
    expect(visibility.request.body).toEqual({
      expectedVersion: 2,
      status: 'ACTIVE',
      confirmReopenAfterAccepted: true,
    });
    visibility.flush(listing);
    api.remove(listing.id, 3).subscribe();
    const remove = http.expectOne(`/api/listings/${listing.id}`);
    expect(remove.request.method).toBe('DELETE');
    expect(remove.request.body).toEqual({ expectedVersion: 3, confirmDelete: true });
    remove.flush(null);
  });
});
