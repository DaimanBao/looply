import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ListingCard } from './listing-card';
import { listingFixture } from '../testing/listing.fixture';

describe('Listing card projection', () => {
  it('links to detail and distinguishes SALE, rental day/month and exchange prices', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ListingCard);
    const listing = listingFixture();
    fixture.componentRef.setInput('listing', listing);
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne(`${listing.cover.deliveryPath}?variant=thumbnail`)
      .flush(new Blob(['image'], { type: 'image/webp' }));
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('h2 a')?.getAttribute('href')).toBe(`/listings/${listing.id}`);
    expect(element.textContent).toContain('250.000 ₫');
    expect(element.textContent).toContain(listing.province.name);
    expect(element.querySelector('time')?.getAttribute('datetime')).toBe(listing.createdAt);
    for (const rentalUnit of ['DAY', 'MONTH'] as const) {
      fixture.componentRef.setInput('listing', { ...listing, type: 'RENT', rentalUnit });
      await fixture.whenStable();
      expect(element.textContent).toContain(rentalUnit === 'DAY' ? '/ ngày' : '/ tháng');
    }
    fixture.componentRef.setInput('listing', {
      ...listing,
      type: 'EXCHANGE',
      price: null,
      rentalUnit: null,
    });
    await fixture.whenStable();
    expect(element.querySelector('.price')?.textContent).toContain('Trao đổi');
    expect(element.querySelector('.price')?.textContent).not.toContain('₫');
    http.verify();
  });
});
