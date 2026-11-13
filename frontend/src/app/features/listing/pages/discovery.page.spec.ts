import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { DiscoveryPage } from './discovery.page';
import { listingFixture } from '../testing/listing.fixture';

describe('Discovery interactions', () => {
  /** Creates the page against cancellable HttpClient requests and the real Province catalog interface. */
  async function setup() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(DiscoveryPage);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/provinces').flush([{ code: '79', name: 'Hồ Chí Minh' }]);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.store.loading()).toBe(true));
    return { fixture, page: fixture.componentInstance, http };
  }
  it('debounces typing, cancels stale suggestions immediately and resets the feed before a changed query returns', async () => {
    const { fixture, page, http } = await setup();
    http
      .expectOne((r) => r.url === '/api/listings')
      .flush({ data: [], pagination: { nextCursor: null } });
    page.form.controls.q.setValue('đèn');
    http.expectNone((r) => r.url === '/api/listings/suggestions');
    await fixture.whenStable();
    await vi.waitFor(() => expect(page.suggesting()).toBe(true));
    const old = http.expectOne('/api/listings/suggestions?q=%C4%91%C3%A8n');
    const oldFeed = http.expectOne((r) => r.url === '/api/listings');
    page.form.controls.q.setValue('ban');
    expect(old.cancelled).toBe(true);
    expect(oldFeed.cancelled).toBe(true);
    expect(page.store.items()).toEqual([]);
    await fixture.whenStable();
    await vi.waitFor(() => expect(page.suggesting()).toBe(true));
    http
      .expectOne('/api/listings/suggestions?q=ban')
      .flush({ data: [{ id: listingFixture().id, title: 'Bàn học bằng gỗ' }] });
    const current = http.expectOne((r) => r.url === '/api/listings');
    expect(current.request.params.get('sort')).toBe('NEWEST');
    current.flush({ data: [], pagination: { nextCursor: null } });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Bàn học bằng gỗ');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Chưa có bài đăng phù hợp',
    );
    http.verify();
  });
  it('requires explicit Nearby location and discards monetary filters when switching to exchange', async () => {
    const { fixture, page, http } = await setup();
    http
      .expectOne((r) => r.url === '/api/listings')
      .flush({ data: [], pagination: { nextCursor: null } });
    const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLButtonElement>('.feed-tabs button')!.click();
    await fixture.whenStable();
    http.expectNone((r) => r.url === '/api/listings');
    expect(element.textContent).toContain('Chọn tỉnh/thành phố');
    page.form.patchValue({ provinceCode: '79', type: 'SALE', minPrice: '100', sort: 'PRICE_ASC' });
    await fixture.whenStable();
    await vi.waitFor(() => expect(page.store.loading()).toBe(true));
    const nearby = http.expectOne((r) => r.url === '/api/listings');
    expect(nearby.request.params.get('feed')).toBe('nearby');
    expect(nearby.request.params.get('provinceCode')).toBe('79');
    nearby.flush({ data: [], pagination: { nextCursor: null } });
    page.form.controls.type.setValue('EXCHANGE');
    expect(page.form.controls.minPrice.value).toBe('');
    expect(page.form.controls.sort.value).toBe('NEWEST');
    await fixture.whenStable();
    await vi.waitFor(() => expect(page.store.loading()).toBe(true));
    http
      .expectOne((r) => r.url === '/api/listings')
      .flush({ data: [], pagination: { nextCursor: null } });
    fixture.destroy();
    http.verify();
  });
  it('cancels debounce and pending HTTP on destruction', async () => {
    const { fixture, page, http } = await setup();
    const pending = http.expectOne((r) => r.url === '/api/listings');
    fixture.destroy();
    expect(pending.cancelled).toBe(true);
    http.verify();
    expect(page.store.loading()).toBe(false);
  });
});
