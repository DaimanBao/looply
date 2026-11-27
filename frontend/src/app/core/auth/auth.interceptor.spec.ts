import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ANONYMOUS, authInterceptor } from './auth.interceptor';
import { SessionService } from './session.service';

describe('Auth interceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let session: SessionService;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    session.accept({ accessToken: 'old-test-token', expiresIn: 900, status: 'ACTIVE' });
  });
  afterEach(() => http.verify());
  it('never attaches credentials to another origin or anonymous credential exchanges', async () => {
    const outside = firstValueFrom(client.get('https://example.org/api/users/me'));
    const publicLogin = firstValueFrom(
      client.post(
        '/api/auth/login/password',
        {},
        { context: new HttpContext().set(ANONYMOUS, true) },
      ),
    );
    for (const url of ['https://example.org/api/users/me', '/api/auth/login/password']) {
      const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.timeout).toBe(url.startsWith('/api/') ? 15000 : undefined);
      request.flush({});
    }
    await Promise.all([outside, publicLogin]);
  });
  it('shares rotation for simultaneous expired reads and retries each once', async () => {
    const a = firstValueFrom(client.get('/api/users/me'));
    const b = firstValueFrom(client.get('/api/auth/sessions'));
    http.expectOne('/api/users/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/auth/sessions').flush({}, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne('/api/auth/refresh')
      .flush({ accessToken: 'new-test-token', expiresIn: 900, status: 'ACTIVE' });
    for (const url of ['/api/users/me', '/api/auth/sessions']) {
      const request = http.expectOne(url);
      expect(request.request.headers.get('Authorization')).toBe('Bearer new-test-token');
      request.flush({});
    }
    await Promise.all([a, b]);
  });
  it('does not retry a rejected OTP mutation or enter an infinite refresh loop', async () => {
    const mutation = firstValueFrom(client.patch('/api/users/me/email', {}));
    http.expectOne('/api/users/me/email').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/users/me').flush({});
    await expect(mutation).rejects.toBeDefined();
    expect(session.authenticated()).toBe(true);
    http.expectNone('/api/auth/refresh');
    const read = firstValueFrom(client.get('/api/users/me'));
    http.expectOne('/api/users/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne('/api/auth/refresh')
      .flush({ accessToken: 'rotated', expiresIn: 900, status: 'ACTIVE' });
    http.expectOne('/api/users/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    await expect(read).rejects.toBeDefined();
    http.expectNone('/api/auth/refresh');
  });
  it('clears authority when a rotated read is still rejected', async () => {
    const result = firstValueFrom(client.get('/api/users/me'));
    http.expectOne('/api/users/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne('/api/auth/refresh')
      .flush({ accessToken: 'revoked', expiresIn: 900, status: 'ACTIVE' });
    http.expectOne('/api/users/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    await expect(result).rejects.toBeDefined();
    expect(session.authenticated()).toBe(false);
  });
  it('does not restore or replay a request after local logout', async () => {
    const result = firstValueFrom(client.get('/api/users/me'));
    const request = http.expectOne('/api/users/me');
    session.clear();
    request.flush({}, { status: 401, statusText: 'Unauthorized' });
    await expect(result).rejects.toBeDefined();
    http.expectNone('/api/auth/refresh');
    expect(session.authenticated()).toBe(false);
  });
  it('distinguishes revoked mutations from wrong OTP without resubmitting the mutation', async () => {
    const result = firstValueFrom(client.patch('/api/users/me/email', {}));
    http.expectOne('/api/users/me/email').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/users/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    await expect(result).rejects.toBeDefined();
    expect(session.authenticated()).toBe(false);
    http.expectNone('/api/auth/refresh');
    http.expectNone('/api/users/me/email');
  });
  it('releases a failed network request without rotating or discarding a valid session', async () => {
    const result = firstValueFrom(client.get('/api/users/me'));
    const request = http.expectOne('/api/users/me');
    expect(request.request.timeout).toBe(15000);
    request.error(new ProgressEvent('timeout'));
    await expect(result).rejects.toMatchObject({ status: 0 });
    expect(session.authenticated()).toBe(true);
    http.expectNone('/api/auth/refresh');
  });
  it('does not clear a newer token when an older authority probe finishes late', async () => {
    const result = firstValueFrom(client.patch('/api/users/me/email', {}));
    http.expectOne('/api/users/me/email').flush({}, { status: 401, statusText: 'Unauthorized' });
    const probe = http.expectOne('/api/users/me');
    const refresh = firstValueFrom(session.refresh());
    http
      .expectOne('/api/auth/refresh')
      .flush({ accessToken: 'renewed-owner', expiresIn: 900, status: 'ACTIVE' });
    await refresh;
    probe.flush({}, { status: 401, statusText: 'Unauthorized' });
    await expect(result).rejects.toBeDefined();
    expect(session.token()).toBe('renewed-owner');
  });
  it('refreshes before expired mutations and submits one-use credentials only once', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 900000);
    try {
      const result = firstValueFrom(
        client.patch('/api/users/me/password', { password: 'not-real' }),
      );
      http.expectNone('/api/users/me/password');
      http
        .expectOne('/api/auth/refresh')
        .flush({ accessToken: 'renewed', expiresIn: 900, status: 'ACTIVE' });
      const request = http.expectOne('/api/users/me/password');
      expect(request.request.headers.get('Authorization')).toBe('Bearer renewed');
      request.flush(null);
      await result;
    } finally {
      vi.restoreAllMocks();
    }
  });
  it('keeps the session and leaves a chat message unsent when refresh is rate limited', async () => {
    session.accept({ accessToken: 'chat-token', expiresIn: 900, status: 'ACTIVE' });
    vi.spyOn(session, 'expiresSoon').mockReturnValue(true);
    const identity = session.identityVersion();
    const messageUrl = '/api/conversations/test-conversation/messages';
    const send = firstValueFrom(client.post(messageUrl, { content: 'Tin nhắn thử' }));
    http.expectOne('/api/auth/refresh').flush({}, { status: 429, statusText: 'Too Many Requests' });
    await expect(send).rejects.toMatchObject({ status: 429 });
    http.expectNone(messageUrl);
    expect(session.token()).toBe('chat-token');
    expect(session.identityVersion()).toBe(identity);

    const retry = firstValueFrom(client.post(messageUrl, { content: 'Tin nhắn thử' }));
    http
      .expectOne('/api/auth/refresh')
      .flush({ accessToken: 'rotated-chat-token', expiresIn: 900, status: 'ACTIVE' });
    const request = http.expectOne(messageUrl);
    expect(request.request.headers.get('Authorization')).toBe('Bearer rotated-chat-token');
    request.flush({});
    await retry;
  });
});
