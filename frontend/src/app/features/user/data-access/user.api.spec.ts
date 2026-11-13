import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UserApi } from './user.api';
import { API_BASE } from '../../../core/http/api.config';

describe('Account deletion cookie transport', () => {
  it('accepts the server cookie-clearing response even with a configured cross-origin API', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: 'https://api.looply.example/api' },
      ],
    });
    const pending = TestBed.inject(UserApi).requestDeletion('one-use-test-proof');
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne('https://api.looply.example/api/users/me/deletion');
    const acceptsCookie = request.request.withCredentials;
    request.flush(null);
    await pending;
    http.verify();
    expect(acceptsCookie).toBe(true);
  });
});
