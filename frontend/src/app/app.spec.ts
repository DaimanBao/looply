import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { App } from './app';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SessionService } from './core/auth/session.service';
import { activeGuard, sessionGuard } from './core/auth/auth.guards';

@Component({ template: '' })
class RoutedPage {}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: 'auth/login', component: RoutedPage },
          { path: 'chat/:id', component: RoutedPage, canActivate: [activeGuard] },
          { path: 'account', component: RoutedPage, canActivate: [activeGuard] },
          { path: 'account/deletion', component: RoutedPage, canActivate: [sessionGuard] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('shows guest navigation without pretending protected actions are available', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('nav')?.textContent).toContain('Đăng nhập');
    expect(compiled.querySelector('nav')?.textContent).not.toContain('Bảo mật');
  });
  it('restricts pending-account navigation to deletion and logout', async () => {
    TestBed.inject(SessionService).accept({
      accessToken: 'test-token',
      expiresIn: 900,
      status: 'PENDING_DELETION',
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('nav')?.textContent).toContain('Tài khoản đang chờ xóa');
    expect(element.querySelector('nav')?.textContent).not.toContain('Bảo mật');
    expect(element.querySelector('nav')?.textContent).toContain('Đăng xuất');
  });

  it.each([
    ['ACTIVE', '/chat/conversation?target=message#latest', undefined],
    ['PENDING_DELETION', '/account/deletion', undefined],
    ['ACTIVE', '/account', '//example.org'],
  ])('returns a restored %s session to %s', async (status, destination, requested) => {
    const fixture = TestBed.createComponent(App);
    const session = TestBed.inject(SessionService);
    const router = TestBed.inject(Router);
    const http = TestBed.inject(HttpTestingController);
    const original = '/chat/conversation?target=message#latest';
    const restore = session.restore();
    http.expectOne('/api/auth/refresh').flush({}, { status: 429, statusText: 'Too Many Requests' });
    await restore;
    if (requested) {
      await router.navigate(['/auth/login'], { queryParams: { returnUrl: requested } });
    } else {
      await router.navigateByUrl(original);
    }
    expect(router.url).toContain('/auth/login');
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.notice')?.textContent).toContain('Chưa khôi phục');
    element.querySelector<HTMLButtonElement>('.notice button')?.click();
    http
      .expectOne('/api/auth/refresh')
      .flush({ accessToken: 'restored-token', expiresIn: 900, status });
    await fixture.whenStable();
    expect(router.url).toBe(destination);
    expect(element.querySelector('.notice')).toBeNull();
  });
});
