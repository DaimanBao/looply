import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { MyListingsPage } from './my-listings.page';
import { SessionService } from '../../../core/auth/session.service';
import { UserApi } from '../../user/public-api';
import { listingFixture } from '../testing/listing.fixture';

describe('My Listings UI', () => {
  it('shows empty state, resets filter cursor and discards the superseded request', async () => {
    const listing = listingFixture();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: { token: signal('token'), active: () => true, identityVersion: () => 1 },
        },
        { provide: UserApi, useValue: { me: async () => listing.owner } },
      ],
    });
    const fixture = TestBed.createComponent(MyListingsPage);
    const http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
    const old = http.expectOne('/api/users/me/listings?limit=12');
    fixture.componentInstance.status.set('HIDDEN');
    await fixture.whenStable();
    expect(old.cancelled).toBe(true);
    http
      .expectOne('/api/users/me/listings?limit=12&status=HIDDEN')
      .flush({ data: [], pagination: { nextCursor: null } });
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Bạn chưa có bài đăng ở trạng thái này.');
    expect(element.querySelector('a[href="/listings/new"]')).not.toBeNull();
    http.verify();
  });

  it('ignores an owner response received after the identity changed', async () => {
    const listing = listingFixture();
    let identity = 1;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: { token: signal('token'), active: () => true, identityVersion: () => identity },
        },
        { provide: UserApi, useValue: { me: async () => listing.owner } },
      ],
    });
    const fixture = TestBed.createComponent(MyListingsPage);
    const http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
    const request = http.expectOne('/api/users/me/listings?limit=12');
    identity++;
    request.flush({ data: [listing], pagination: { nextCursor: null } });
    expect(fixture.componentInstance.rows()).toEqual([]);
    http.verify();
  });
});
