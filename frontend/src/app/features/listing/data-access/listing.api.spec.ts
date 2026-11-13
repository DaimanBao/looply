import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ListingApi } from './listing.api';
import { discoveryQuery, INITIAL_FILTERS } from '../models/discovery-query';
import { listingFixture } from '../testing/listing.fixture';

describe('Listing API contract boundary', () => {
  let api: ListingApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ListingApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('sends exact Vietnamese, rental and cursor parameters, with 12 rows and no invented seed', () => {
    const query = discoveryQuery({
      ...INITIAL_FILTERS,
      q: 'Đèn học',
      tab: 'nearby',
      provinceCode: '79',
      type: 'RENT',
      rentalUnit: 'DAY',
      minPrice: '100',
      maxPrice: '500',
      postedWithin: '7D',
      sort: 'PRICE_ASC',
    }).query!;
    let rows = -1;
    api.discover(query, 'opaque_cursor').subscribe((page) => (rows = page.data.length));
    const request = http.expectOne((request) => request.url === '/api/listings');
    expect(
      Object.fromEntries(
        request.request.params.keys().map((key) => [key, request.request.params.get(key)]),
      ),
    ).toEqual({ ...query, limit: '12', after: 'opaque_cursor' });
    request.flush({ data: [listingFixture()], pagination: { nextCursor: null } });
    expect(rows).toBe(1);
  });
  it('propagates transport errors and rejects malformed/private list projections', () => {
    let failed = false;
    api
      .discover(discoveryQuery(INITIAL_FILTERS).query!)
      .subscribe({ error: () => (failed = true) });
    http
      .expectOne((request) => request.url === '/api/listings')
      .flush({ data: [listingFixture({ status: 'HIDDEN' })], pagination: { nextCursor: null } });
    expect(failed).toBe(true);
    let status = 0;
    api.detail('unknown').subscribe({ error: (error) => (status = error.status) });
    http.expectOne('/api/listings/unknown').flush({}, { status: 404, statusText: 'Not Found' });
    expect(status).toBe(404);
  });
  it('rejects unexpected media URLs and strips extra private owner fields', () => {
    let failed = false;
    const fixture = listingFixture();
    api.detail(fixture.id).subscribe({ error: () => (failed = true) });
    http.expectOne(`/api/listings/${fixture.id}`).flush({
      ...fixture,
      cover: { ...fixture.cover, deliveryPath: 'https://unexpected.invalid/private' },
    });
    expect(failed).toBe(true);
    let owner: unknown;
    api.detail(fixture.id).subscribe((listing) => (owner = listing.owner));
    http
      .expectOne(`/api/listings/${fixture.id}`)
      .flush({ ...fixture, owner: { ...fixture.owner, email: 'private', phone: 'private' } });
    expect(owner).toEqual(fixture.owner);
  });
  it('reads server suggestions and requests media bytes with the required variant', () => {
    const fixture = listingFixture();
    let suggestions = 0;
    api.suggestions('den').subscribe((rows) => (suggestions = rows.length));
    http
      .expectOne('/api/listings/suggestions?q=den')
      .flush({ data: [{ id: fixture.id, title: fixture.title }] });
    expect(suggestions).toBe(1);
    api.media(fixture.id, fixture.cover, 'thumbnail').subscribe();
    const request = http.expectOne(`${fixture.cover.deliveryPath}?variant=thumbnail`);
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['image'], { type: 'image/webp' }));
  });
});
