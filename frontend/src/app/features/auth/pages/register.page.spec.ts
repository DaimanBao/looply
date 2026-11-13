import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RegisterPage } from './register.page';
import { SessionService } from '../../../core/auth/session.service';

describe('Registration form', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  it('loads provinces and submits OTP proof without inventing verification', async () => {
    const fixture = TestBed.createComponent(RegisterPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/provinces').flush([{ code: '01', name: 'Thành phố Hà Nội' }]);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.form.setValue({
      username: 'new_user',
      password: 'test-only-password',
      phone: '+84901234567',
      provinceCode: '01',
      email: '',
    });
    await page.submit();
    http.expectNone('/api/auth/register');
    expect(page.state.error()).not.toBe('');
    page.proof.set({ challengeId: 'test-challenge', code: '123456' });
    const navigation = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const pending = page.submit();
    const request = http.expectOne('/api/auth/register');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body['email']).toBeUndefined();
    expect(request.request.body['challengeId']).toBe('test-challenge');
    request.flush({ accessToken: 'registered-token', expiresIn: 900, status: 'ACTIVE' });
    await pending;
    expect(TestBed.inject(SessionService).authenticated()).toBe(true);
    expect(page.form.controls.password.value).toBe('');
    expect(navigation).toHaveBeenCalledWith('/account');
    http.verify();
  });
});
