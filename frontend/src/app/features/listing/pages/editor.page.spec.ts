import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { EditorPage } from './editor.page';
import { SessionService } from '../../../core/auth/session.service';
import { UserApi } from '../../user/public-api';
import { listingFixture } from '../testing/listing.fixture';

describe('Listing management editor UI', () => {
  afterEach(() => vi.restoreAllMocks());
  it('renders saved media, cancels important actions and protects dirty/busy navigation', async () => {
    const listing = listingFixture();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:editor');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ listingId: listing.id })) },
        },
        {
          provide: SessionService,
          useValue: { token: signal('token'), active: () => true, identityVersion: () => 1 },
        },
        {
          provide: UserApi,
          useValue: {
            me: async () => ({ ...listing.owner, phone: null }),
            provinces: async () => [listing.province],
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(EditorPage);
    const http = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
    http.expectOne(`/api/listings/${listing.id}`).flush(listing);
    await vi.waitFor(() => expect(fixture.componentInstance.editor.ready()).toBe(true));
    await fixture.whenStable();
    // Không cần tải byte để kiểm tra hành vi form và hộp xác nhận.
    http
      .expectOne((request) => request.url.endsWith(`/media/${listing.cover.id}`))
      .flush(new Blob([], { type: 'image/webp' }));
    await fixture.whenStable();
    const page = fixture.componentInstance;
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ảnh đại diện');
    expect(page.editor.form.controls.title.value).toBe(listing.title);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await page.remove();
    await page.visibility();
    http.expectNone((request) => request.method === 'DELETE' || request.method === 'PATCH');
    page.editor.form.markAsDirty();
    expect(page.canLeave()).toBe(false);
    confirm.mockReturnValue(true);
    expect(page.canLeave()).toBe(true);
    page.editor.busy.set(true);
    expect(page.canLeave()).toBe(false);
    confirm.mockRestore();
    http.verify();
  });
});
