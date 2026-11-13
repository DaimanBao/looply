import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ListingGallery } from './listing-gallery';
import { listingFixture } from '../testing/listing.fixture';
import type { ListingVideo } from '../models/listing.models';

describe('Listing gallery and native media', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-listing');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());
  it('switches from cover to protected video with controls, reports native errors, retries and releases URLs', async () => {
    const listing = listingFixture();
    const video: ListingVideo = {
      id: '00000000-0000-4000-8000-000000000020',
      type: 'VIDEO',
      mimeType: 'video/mp4',
      sizeBytes: '1000',
      durationSeconds: 1,
      position: null,
      isCover: false,
      deliveryPath: `/api/listings/${listing.id}/media/00000000-0000-4000-8000-000000000020`,
    };
    const fixture = TestBed.createComponent(ListingGallery);
    fixture.componentRef.setInput('listing', { ...listing, media: [listing.cover, video] });
    const http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
    http
      .expectOne(`${listing.cover.deliveryPath}?variant=detail`)
      .flush(new Blob(['image'], { type: 'image/webp' }));
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    element.querySelector('img')!.dispatchEvent(new Event('load'));
    element.querySelectorAll<HTMLButtonElement>('nav button')[1].click();
    await fixture.whenStable();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-listing');
    http
      .expectOne(`${video.deliveryPath}?variant=original`)
      .flush(new Blob(['video'], { type: 'video/mp4' }));
    await fixture.whenStable();
    const player = element.querySelector('video')!;
    expect(player.controls).toBe(true);
    expect(player.hasAttribute('autoplay')).toBe(false);
    expect(player.src).toBe('blob:test-listing');
    player.dispatchEvent(new Event('loadedmetadata'));
    await fixture.whenStable();
    expect(element.textContent).not.toContain('Đang tải video');
    player.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(element.textContent).toContain('Không tải được video');
    element.querySelector<HTMLButtonElement>('.text-button')!.click();
    await fixture.whenStable();
    const pending = http.expectOne(`${video.deliveryPath}?variant=original`);
    fixture.destroy();
    expect(pending.cancelled).toBe(true);
    http.verify();
  });
  it('shows a media failure without losing the listing when HTTP delivery is denied', async () => {
    const listing = listingFixture();
    const fixture = TestBed.createComponent(ListingGallery);
    fixture.componentRef.setInput('listing', listing);
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne(`${listing.cover.deliveryPath}?variant=detail`)
      .flush(new Blob(['{}'], { type: 'application/json' }), {
        status: 404,
        statusText: 'Not Found',
      });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Không tải được ảnh');
    http.verify();
  });
});
