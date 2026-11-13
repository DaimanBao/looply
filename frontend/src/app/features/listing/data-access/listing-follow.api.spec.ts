import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ListingFollowApi } from './listing-follow.api';
import { listingFixture } from '../testing/listing.fixture';

describe('Followed Listings response boundary', () => {
  it('rejects hidden or unfollowed rows instead of displaying an inconsistent private list', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const api = TestBed.inject(ListingFollowApi);
    for (const row of [listingFixture(), listingFixture({ isFollowed: true, status: 'HIDDEN' })]) {
      let failed = false;
      api.followed('opaque').subscribe({ error: () => (failed = true) });
      http
        .expectOne('/api/users/me/followed-listings?limit=12&after=opaque')
        .flush({ data: [row], pagination: { nextCursor: null } });
      expect(failed).toBe(true);
    }
    http.verify();
  });
});
