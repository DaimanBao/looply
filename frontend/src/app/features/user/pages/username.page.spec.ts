import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UsernamePage } from './username.page';
import { SessionService } from '../../../core/auth/session.service';

describe('Username native form submission', () => {
  it('submits the real form event and displays the server cooldown timestamp', async () => {
    TestBed.configureTestingModule({
      imports: [UsernamePage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(SessionService).accept({
      accessToken: 'owner',
      expiresIn: 900,
      status: 'ACTIVE',
    });
    const fixture = TestBed.createComponent(UsernamePage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/users/me').flush({ username: 'old_name', usernameChangedAt: null });
    await vi.waitFor(() => expect(fixture.componentInstance.state.busy()).toBe(false));
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input');
    if (!input) throw new Error('Missing username input');
    input.value = 'NEW_NAME';
    input.dispatchEvent(new Event('input'));
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const request = http.expectOne('/api/users/me/username');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ username: 'new_name' });
    request.flush({ username: 'new_name', usernameChangedAt: '2026-11-13T00:00:00Z' });
    await vi.waitFor(() => expect(fixture.componentInstance.state.busy()).toBe(false));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('13/12/2026');
    http.verify();
  });
});
