import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PublicProfilePage } from './public-profile.page';

describe('Public profile route reuse', () => {
  it('does not show a late response for a previously visited profile', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'users/:userId', component: PublicProfilePage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const http = TestBed.inject(HttpTestingController);
    const first = '00000000-0000-4000-8000-000000000001';
    const second = '00000000-0000-4000-8000-000000000002';
    await harness.navigateByUrl(`/users/${first}`);
    const old = http.expectOne(`/api/users/${first}`);
    await harness.navigateByUrl(`/users/${second}`);
    const current = http.expectOne(`/api/users/${second}`);
    current.flush({
      id: second,
      displayName: 'Hồ sơ hiện tại',
      username: 'second',
      bio: null,
      province: null,
      avatarUrl: null,
      followers: 0,
      following: 0,
    });
    await vi.waitFor(() =>
      expect(harness.routeNativeElement?.textContent).toContain('Hồ sơ hiện tại'),
    );
    old.flush({
      id: first,
      displayName: 'Hồ sơ cũ',
      username: 'first',
      bio: null,
      province: null,
      avatarUrl: null,
      followers: 0,
      following: 0,
    });
    await Promise.resolve();
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).not.toContain('Hồ sơ cũ');
    http.verify();
  });
});
