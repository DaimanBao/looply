import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReauthInput } from './reauth-input';

describe('Re-authentication control', () => {
  it('sends exactly the selected phone method and clears consumed proof inputs', async () => {
    TestBed.configureTestingModule({
      imports: [ReauthInput],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ReauthInput);
    fixture.componentRef.setInput('operation', 'CHANGE_PASSWORD');
    fixture.componentRef.setInput('phone', '+84901234567');
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.password.setValue('unused-test-password');
    component.method.set('phone');
    component.proof.set({ challengeId: 'test-challenge', code: '123456' });
    const pending = component.authorize();
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne('/api/auth/reauthenticate');
    expect(request.request.body).toEqual({
      operation: 'CHANGE_PASSWORD',
      challengeId: 'test-challenge',
      code: '123456',
    });
    request.flush({ reauthProof: 'one-use-test-proof', expiresIn: 300 });
    expect(await pending).toBe('one-use-test-proof');
    expect(component.password.value).toBe('');
    expect(component.proof()).toBeNull();
    http.verify();
  });
});
