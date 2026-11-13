import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let session: SessionService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    session = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('shares concurrent refresh and keeps pending deletion status', async () => {
    const first = firstValueFrom(session.refresh());
    const second = firstValueFrom(session.refresh());
    const request = http.expectOne('/api/auth/refresh');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ accessToken: 'opaque-test-token', expiresIn: 900, status: 'PENDING_DELETION' });
    await Promise.all([first, second]);
    expect(session.status()).toBe('PENDING_DELETION');
    expect(session.token()).toBe('opaque-test-token');
  });
  it('clears revoked sessions and permits a subsequent fresh attempt', async () => {
    const failed = firstValueFrom(session.refresh());
    http.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    await expect(failed).rejects.toBeDefined();
    expect(session.token()).toBeNull();
    const next = firstValueFrom(session.refresh());
    http
      .expectOne('/api/auth/refresh')
      .flush({ accessToken: 'new-test-token', expiresIn: 900, status: 'ACTIVE' });
    await next;
    expect(session.status()).toBe('ACTIVE');
  });
  it('cannot revive local authority from a refresh finishing after logout or another login', async () => {
    const pending = firstValueFrom(session.refresh());
    session.clear();
    http
      .expectOne('/api/auth/refresh')
      .flush({ accessToken: 'stale-token', expiresIn: 900, status: 'ACTIVE' });
    await expect(pending).rejects.toBeDefined();
    expect(session.authenticated()).toBe(false);
    const oldRefresh = firstValueFrom(session.refresh());
    session.accept({ accessToken: 'other-account-token', expiresIn: 900, status: 'ACTIVE' });
    http
      .expectOne('/api/auth/refresh')
      .flush({ accessToken: 'previous-account-token', expiresIn: 900, status: 'ACTIVE' });
    await expect(oldRefresh).rejects.toBeDefined();
    expect(session.token()).toBe('other-account-token');
  });
  it('waits for rotation before revoking the replacement cookie', async () => {
    const pending = firstValueFrom(session.refresh());
    const logout = firstValueFrom(session.logout());
    http.expectNone('/api/auth/logout');
    http
      .expectOne('/api/auth/refresh')
      .flush({ accessToken: 'rotated', expiresIn: 900, status: 'ACTIVE' });
    await pending;
    const request = http.expectOne('/api/auth/logout');
    expect(request.request.withCredentials).toBe(true);
    request.flush(null);
    await logout;
    expect(session.authenticated()).toBe(false);
  });
  it('rejects malformed or irreversible account session responses', () => {
    expect(() =>
      session.accept({ accessToken: 'untrusted', expiresIn: 900, status: 'ADMIN' }),
    ).toThrow();
    for (const status of ['DELETING', 'DELETED']) {
      expect(() => session.accept({ accessToken: 'untrusted', expiresIn: 900, status })).toThrow();
      expect(session.authenticated()).toBe(false);
    }
  });
  it('prevents a new cookie rotation while logout is in flight', async () => {
    session.accept({ accessToken: 'test-token', expiresIn: 900, status: 'ACTIVE' });
    const logout = firstValueFrom(session.logout());
    const request = http.expectOne('/api/auth/logout');
    await expect(firstValueFrom(session.refresh())).rejects.toBeDefined();
    http.expectNone('/api/auth/refresh');
    request.flush(null);
    await logout;
    expect(session.authenticated()).toBe(false);
  });
});
