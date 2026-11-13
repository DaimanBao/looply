import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../../core/auth/session.service';
import { ListingFollowState } from './listing-follow.state';
import { listingFixture } from '../testing/listing.fixture';

describe('Shared Listing Follow state', () => {
  let state: ListingFollowState;
  let session: SessionService;
  let http: HttpTestingController;
  const listing = listingFixture();

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    session = TestBed.inject(SessionService);
    session.accept({ accessToken: 'first', expiresIn: 900, status: 'ACTIVE' });
    state = TestBed.inject(ListingFollowState);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  /** Nạp danh tính chủ qua cùng API riêng của ứng dụng. */
  async function prepare(ownerId = 'viewer'): Promise<void> {
    const preparing = state.prepareOwner();
    http.expectOne('/api/users/me').flush({ id: ownerId });
    await preparing;
    state.accept([listing], state.beginRead());
  }

  it('shares busy state and sends exactly one idempotent mutation for repeated clicks', async () => {
    await prepare();
    state.toggle(listing);
    state.toggle(listing);
    expect(state.busy(listing.id)).toBe(true);
    const put = http.expectOne(`/api/listings/${listing.id}/follow`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({});
    put.flush(null);
    expect(state.followed(listing)).toBe(true);
    state.toggle(listing);
    const remove = http.expectOne(`/api/listings/${listing.id}/follow`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);
    expect(state.followed(listing)).toBe(false);
  });

  it('rejects guest, self Follow and new Follow on hidden Listing but permits unfollow', async () => {
    session.clear();
    state.toggle(listing);
    http.expectNone((request) => request.url.endsWith('/follow'));
    session.accept({ accessToken: 'second', expiresIn: 900, status: 'ACTIVE' });
    await prepare(listing.owner.id);
    state.toggle(listing);
    http.expectNone((request) => request.url.endsWith('/follow'));
    session.accept({ accessToken: 'third', expiresIn: 900, status: 'ACTIVE' });
    await prepare();
    state.toggle({ ...listing, status: 'HIDDEN' });
    http.expectNone((request) => request.url.endsWith('/follow'));
    state.accept([{ ...listing, isFollowed: true }], state.beginRead());
    state.toggle({ ...listing, status: 'HIDDEN' });
    http.expectOne(`/api/listings/${listing.id}/follow`).flush(null);
    expect(state.followed(listing)).toBe(false);
  });

  it('ignores GET begun before/during mutation and accepts a genuinely newer reload', async () => {
    await prepare();
    const oldRead = state.beginRead();
    state.toggle(listing);
    const during = state.beginRead();
    state.accept([listing], during);
    expect(state.busy(listing.id)).toBe(true);
    http.expectOne(`/api/listings/${listing.id}/follow`).flush(null);
    state.accept([listing], oldRead);
    state.accept([listing], during);
    expect(state.followed(listing)).toBe(true);
    state.accept([listing], state.beginRead());
    expect(state.followed(listing)).toBe(false);
  });

  it('does not apply old mutation, snapshot or projection to another identity', async () => {
    await prepare();
    const read = state.beginRead();
    state.toggle(listing);
    const old = http.expectOne(`/api/listings/${listing.id}/follow`);
    session.accept({ accessToken: 'new-account', expiresIn: 900, status: 'ACTIVE' });
    old.flush(null);
    state.accept([{ ...listing, isFollowed: true }], read);
    expect(state.followed({ ...listing, isFollowed: true })).toBe(false);
    await prepare();
    expect(state.followed({ ...listing, isFollowed: true })).toBe(false);
    expect(state.busy(listing.id)).toBe(false);
  });

  it('keeps Follow across token rotation but allows retry after mutation failure', async () => {
    await prepare();
    state.accept([{ ...listing, isFollowed: true }], state.beginRead());
    session.refresh().subscribe();
    http
      .expectOne('/api/auth/refresh')
      .flush({ accessToken: 'rotated', expiresIn: 900, status: 'ACTIVE' });
    expect(state.followed(listing)).toBe(true);
    state.toggle(listing);
    http
      .expectOne(`/api/listings/${listing.id}/follow`)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(state.followed(listing)).toBe(true);
    expect(state.busy(listing.id)).toBe(false);
    expect(state.error(listing.id)).not.toBe('');
    state.toggle(listing);
    http.expectOne(`/api/listings/${listing.id}/follow`).flush(null);
    expect(state.followed(listing)).toBe(false);
  });

  it('shares one owner request and discards its response after an account switch', async () => {
    const first = state.prepareOwner();
    await state.prepareOwner();
    const request = http.expectOne('/api/users/me');
    session.accept({ accessToken: 'next', expiresIn: 900, status: 'ACTIVE' });
    request.flush({ id: 'old-owner' });
    await first;
    expect(state.ownerId()).toBeNull();
    await prepare('new-owner');
    expect(state.ownerId()).toBe('new-owner');
  });
});
