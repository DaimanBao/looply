import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RelationshipsPage } from './relationships.page';

describe('Relationship pagination', () => {
  it('uses the real cursor, appends unique profiles and stops at the last page', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'users/:userId/following',
            component: RelationshipsPage,
            data: { kind: 'following' },
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const http = TestBed.inject(HttpTestingController);
    const profile = {
      id: '00000000-0000-4000-8000-000000000001',
      username: 'first',
      displayName: 'Thành viên',
      bio: null,
      province: null,
      avatarUrl: null,
      followers: 0,
      following: 0,
    };
    const page = await harness.navigateByUrl(
      '/users/00000000-0000-4000-8000-000000000003/following',
      RelationshipsPage,
    );
    const initial = http.expectOne((request) => request.url.endsWith('/following'));
    expect(initial.request.params.get('limit')).toBe('20');
    initial.flush({ data: [profile], pagination: { nextCursor: profile.id } });
    await vi.waitFor(() => expect(page.state.busy()).toBe(false));
    const next = page.loadMore();
    const request = http.expectOne((request) => request.url.endsWith('/following'));
    expect(request.request.params.get('after')).toBe(profile.id);
    request.flush({
      data: [
        profile,
        { ...profile, id: '00000000-0000-4000-8000-000000000002', username: 'second' },
      ],
      pagination: { nextCursor: null },
    });
    await next;
    expect(page.profiles()).toHaveLength(2);
    expect(page.cursor()).toBeNull();
    await page.loadMore();
    http.expectNone((request) => request.url.endsWith('/following'));
    http.verify();
  });
});
