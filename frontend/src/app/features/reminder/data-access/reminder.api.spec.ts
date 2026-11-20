import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReminderApi, decodeReminders } from './reminder.api';

describe('ReminderApi', () => {
  it('accepts only the three distinct contract codes', () => {
    expect(decodeReminders({ items: ['PHONE', 'EMAIL', 'PROVINCE'] })).toEqual([
      'PHONE',
      'EMAIL',
      'PROVINCE',
    ]);
    for (const items of [['AVATAR'], ['PHONE', 'PHONE'], ['EMAIL', 1], null])
      expect(() => decodeReminders({ items })).toThrow();
  });

  it('keeps pure evaluation separate from the presentation mutation', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const api = TestBed.inject(ReminderApi);
    const http = TestBed.inject(HttpTestingController);
    const presentation = api.present();
    const post = http.expectOne('/api/reminders/presentation');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({});
    post.flush({ items: ['EMAIL'] });
    expect(await presentation).toEqual(['EMAIL']);
    const evaluation = api.evaluate();
    const get = http.expectOne('/api/reminders');
    expect(get.request.method).toBe('GET');
    get.flush({ items: [] });
    expect(await evaluation).toEqual([]);
    http.verify();
  });
});
