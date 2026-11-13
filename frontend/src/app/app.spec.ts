import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SessionService } from './core/auth/session.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
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
});
