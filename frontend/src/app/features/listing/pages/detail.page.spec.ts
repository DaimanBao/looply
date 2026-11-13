import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from '../../../app.routes';
import { SessionService } from '../../../core/auth/session.service';
import { listingFixture } from '../testing/listing.fixture';
import { DetailPage } from './detail.page';
import { authInterceptor } from '../../../core/auth/auth.interceptor';

describe('Public listing routes', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    }),
  );
  it('keeps loaded detail and its gallery while the same session rotates its token', async () => {
    const session = TestBed.inject(SessionService);
    session.accept({ accessToken: 'before-rotation', expiresIn: 900, status: 'ACTIVE' });
    const harness = await RouterTestingHarness.create();
    const http = TestBed.inject(HttpTestingController);
    const listing = listingFixture();
    await harness.navigateByUrl(`/listings/${listing.id}`, DetailPage);
    http.expectOne(`/api/listings/${listing.id}`).flush(listing);
    await harness.fixture.whenStable();
    http.expectOne(`${listing.cover.deliveryPath}?variant=detail`).flush(new Blob(['image'], { type: 'image/webp' }));
    await harness.fixture.whenStable();
    const image = harness.routeNativeElement?.querySelector('img');
    session.refresh().subscribe();
    http.expectOne('/api/auth/refresh').flush({ accessToken: 'after-rotation', expiresIn: 900, status: 'ACTIVE' });
    await harness.fixture.whenStable();
    http.expectNone(`/api/listings/${listing.id}`);
    http.expectNone(`${listing.cover.deliveryPath}?variant=detail`);
    expect(harness.routeNativeElement?.textContent).toContain(listing.title);
    expect(harness.routeNativeElement?.querySelector('img')).toBe(image);
    http.verify();
  });
  it('allows guests, cancels reused detail routes and shows unavailable for 404', async () => {
    const harness = await RouterTestingHarness.create();
    const http = TestBed.inject(HttpTestingController);
    const id = listingFixture().id;
    await harness.navigateByUrl(`/listings/${id}`, DetailPage);
    const old = http.expectOne(`/api/listings/${id}`);
    await harness.navigateByUrl('/listings/00000000-0000-4000-8000-000000000002', DetailPage);
    expect(old.cancelled).toBe(true);
    http
      .expectOne('/api/listings/00000000-0000-4000-8000-000000000002')
      .flush({}, { status: 404, statusText: 'Not Found' });
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('Bài đăng không khả dụng');
    expect(TestBed.inject(SessionService).authenticated()).toBe(false);
    http.verify();
  });
  it('renders published contact and owner-hidden notice, then removes detail on logout', async () => {
    TestBed.inject(SessionService).accept({
      accessToken: 'test',
      expiresIn: 900,
      status: 'ACTIVE',
    });
    const harness = await RouterTestingHarness.create();
    const http = TestBed.inject(HttpTestingController);
    const listing = listingFixture({ status: 'HIDDEN', contactPhone: '+84912345678' });
    await harness.navigateByUrl(`/listings/${listing.id}`, DetailPage);
    http.expectOne(`/api/listings/${listing.id}`).flush(listing);
    await harness.fixture.whenStable();
    http
      .expectOne(`${listing.cover.deliveryPath}?variant=detail`)
      .flush(new Blob(['image'], { type: 'image/webp' }));
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('Bài đăng đang ẩn');
    expect(harness.routeNativeElement?.querySelector('a[href="tel:+84912345678"]')).not.toBeNull();
    TestBed.inject(SessionService).clear();
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).not.toContain(listing.title);
    http
      .expectOne(`/api/listings/${listing.id}`)
      .flush({}, { status: 404, statusText: 'Not Found' });
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('Bài đăng không khả dụng');
    http.verify();
  });
  it('lets guests open Home without redirecting to login', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/');
    harness.fixture.destroy();
    TestBed.inject(HttpTestingController)
      .match(() => true)
      .forEach((request) => {
        if (!request.cancelled) request.flush([]);
      });
  });
});
