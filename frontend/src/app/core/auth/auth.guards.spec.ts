import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { activeGuard, publicGuard } from './auth.guards';
import { SessionService } from './session.service';

describe('Account lifecycle guards', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  it('keeps pending deletion restricted without restoring the account', () => {
    TestBed.inject(SessionService).accept({
      accessToken: 'pending-token',
      expiresIn: 900,
      status: 'PENDING_DELETION',
    });
    const route = TestBed.inject(Router).routerState.snapshot.root;
    const result = TestBed.runInInjectionContext(() =>
      activeGuard(route, { url: '/account/edit', root: route }),
    );
    expect(String(result)).toBe('/account/deletion');
    expect(
      TestBed.runInInjectionContext(() => publicGuard(route, { url: '/', root: route })).toString(),
    ).toBe('/account/deletion');
    expect(TestBed.inject(SessionService).status()).toBe('PENDING_DELETION');
  });
  it('redirects guests while allowing an active account', () => {
    const route = TestBed.inject(Router).routerState.snapshot.root;
    expect(
      String(
        TestBed.runInInjectionContext(() =>
          activeGuard(route, { url: '/account/edit', root: route }),
        ),
      ),
    ).toContain('/auth/login');
    TestBed.inject(SessionService).accept({
      accessToken: 'active-token',
      expiresIn: 900,
      status: 'ACTIVE',
    });
    expect(
      TestBed.runInInjectionContext(() =>
        activeGuard(route, { url: '/account/edit', root: route }),
      ),
    ).toBe(true);
  });
});
