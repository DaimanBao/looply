import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ListingFollow } from './listing-follow';
import { listingFixture } from '../testing/listing.fixture';
import { SessionService } from '../../../core/auth/session.service';
import { vi } from 'vitest';

describe('Listing Follow authentication UI', () => {
  it('invites guest to login with a return URL and shows management instead of self Follow', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ListingFollow);
    const listing = listingFixture();
    fixture.componentRef.setInput('listing', listing);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const link = element.querySelector('a');
    expect(link?.textContent).toContain('Đăng nhập để theo dõi');
    expect(link?.getAttribute('href')).toContain('returnUrl=%2Flistings%2F');
    const http = TestBed.inject(HttpTestingController);
    http.expectNone((request) => request.url.endsWith('/follow'));
    TestBed.inject(SessionService).accept({
      accessToken: 'owner',
      expiresIn: 900,
      status: 'ACTIVE',
    });
    await fixture.whenStable();
    http.expectOne('/api/users/me').flush({ id: listing.owner.id });
    await fixture.whenStable();
    await vi.waitFor(() => expect(element.textContent).toContain('Quản lý bài đăng'));
    expect(element.querySelector('button')).toBeNull();
    http.verify();
  });
});
