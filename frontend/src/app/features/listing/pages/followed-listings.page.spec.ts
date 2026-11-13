import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FollowedListingsPage } from './followed-listings.page';
import { SessionService } from '../../../core/auth/session.service';
import { listingFixture } from '../testing/listing.fixture';

describe('Followed Listings pagination and identity', () => {
  it('deduplicates pages, retains retry cursor, removes unfollowed rows and resets on account switch', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const session = TestBed.inject(SessionService);
    session.accept({ accessToken: 'first', expiresIn: 900, status: 'ACTIVE' });
    const fixture = TestBed.createComponent(FollowedListingsPage);
    const page = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
    const listing = listingFixture({ isFollowed: true });
    http
      .expectOne('/api/users/me/followed-listings?limit=12')
      .flush({ data: [listing], pagination: { nextCursor: 'next' } });
    await fixture.whenStable();
    http.expectOne('/api/users/me').flush({ id: 'viewer' });
    http
      .expectOne(`${listing.cover.deliveryPath}?variant=thumbnail`)
      .flush(new Blob(['x'], { type: 'image/webp' }));
    await fixture.whenStable();
    expect(page.rows()).toHaveLength(1);
    page.store.loadMore();
    page.store.loadMore();
    http
      .expectOne('/api/users/me/followed-listings?limit=12&after=next')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(page.rows()).toHaveLength(1);
    expect(page.store.cursor()).toBe('next');
    page.store.loadMore();
    http
      .expectOne('/api/users/me/followed-listings?limit=12&after=next')
      .flush({ data: [listing], pagination: { nextCursor: null } });
    expect(page.rows()).toHaveLength(1);
    page.follows.toggle(listing);
    http.expectOne(`/api/listings/${listing.id}/follow`).flush(null);
    await fixture.whenStable();
    expect(page.rows()).toHaveLength(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Chưa có bài đăng theo dõi hiển thị',
    );
    page.reload();
    const old = http.expectOne('/api/users/me/followed-listings?limit=12');
    session.accept({ accessToken: 'next-account', expiresIn: 900, status: 'ACTIVE' });
    await fixture.whenStable();
    expect(old.cancelled).toBe(true);
    expect(page.store.items()).toEqual([]);
    http
      .expectOne('/api/users/me/followed-listings?limit=12')
      .flush({ data: [], pagination: { nextCursor: null } });
    await fixture.whenStable();
    http.verify();
  });
});
