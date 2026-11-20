import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ProfileStore } from '../../user/public-api';
import { ReminderApi } from '../data-access/reminder.api';
import type { ReminderField } from '../models/reminder.models';
import { ReminderState } from './reminder.state';

/** Điều khiển thứ tự response thật sự, không dựa vào sleep. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('ReminderState', () => {
  let state: ReminderState;
  let session: SessionService;
  let api: { present: ReturnType<typeof vi.fn>; evaluate: ReturnType<typeof vi.fn> };

  /** Chạy effect và promise completion để kiểm tra hành vi người dùng nhìn thấy. */
  async function settle() {
    TestBed.tick();
    await Promise.resolve();
    TestBed.tick();
  }

  /** Đăng nhập qua cùng cổng public mà form Auth sử dụng. */
  function login(token = 'first') {
    session.accept({ accessToken: token, status: 'ACTIVE', expiresIn: 900 });
  }

  beforeEach(() => {
    api = {
      present: vi.fn().mockResolvedValue(['EMAIL', 'PROVINCE']),
      evaluate: vi.fn().mockResolvedValue([]),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ReminderApi, useValue: api },
        { provide: ProfileStore, useValue: { profile: signal(null) } },
      ],
    });
    session = TestBed.inject(SessionService);
    state = TestBed.inject(ReminderState);
  });

  it('never requests for guests or pending accounts', async () => {
    await settle();
    session.accept({ accessToken: 'pending', status: 'PENDING_DELETION', expiresIn: 900 });
    await settle();
    expect(api.present).not.toHaveBeenCalled();
    expect(state.items()).toEqual([]);
  });

  it('presents once, retains across rotation and does not repeat after dismiss or navigation', async () => {
    login();
    await settle();
    expect(state.items()).toEqual(['EMAIL', 'PROVINCE']);
    const refreshed = firstValueFrom(session.refresh());
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/refresh')
      .flush({ accessToken: 'rotated', status: 'ACTIVE', expiresIn: 900 });
    await refreshed;
    await settle();
    expect(api.present).toHaveBeenCalledTimes(1);
    state.dismiss();
    await state.present();
    expect(state.items()).toEqual([]);
    expect(api.present).toHaveBeenCalledTimes(1);
  });

  it('coalesces duplicate requests and supports retry after infrastructure failure', async () => {
    const pending = deferred<ReminderField[]>();
    api.present.mockRejectedValueOnce(new Error('Offline')).mockReturnValueOnce(pending.promise);
    login();
    await settle();
    expect(state.error()).toBeTruthy();
    const retry = state.present();
    await state.present();
    expect(api.present).toHaveBeenCalledTimes(2);
    expect(state.loading()).toBe(true);
    pending.resolve(['PHONE']);
    await retry;
    expect(state.error()).toBe('');
    expect(state.items()).toEqual(['PHONE']);
  });

  it('rejects an old account response even before its reset effect runs', async () => {
    const old = deferred<ReminderField[]>();
    api.present.mockReturnValueOnce(old.promise);
    login();
    await settle();
    login('second');
    old.resolve(['PHONE']);
    await Promise.resolve();
    expect(state.items()).toEqual([]);
    await settle();
    expect(state.items()).toEqual(['EMAIL', 'PROVINCE']);
    session.clear();
    await settle();
    expect(state.items()).toEqual([]);
  });

  it('only removes completed fields, and dismissal defeats an in-flight recalculation', async () => {
    login();
    await settle();
    api.evaluate.mockResolvedValueOnce(['PHONE', 'EMAIL']);
    await state.recalculate();
    expect(state.items()).toEqual(['EMAIL']);
    const old = deferred<ReminderField[]>();
    api.evaluate.mockReturnValueOnce(old.promise);
    const request = state.recalculate();
    state.dismiss();
    old.resolve(['EMAIL']);
    await request;
    expect(state.items()).toEqual([]);
    expect(state.loading()).toBe(false);
  });

  it('a new login starts another evaluation while completed profiles remain quiet', async () => {
    api.present.mockResolvedValueOnce([]);
    login();
    await settle();
    expect(state.items()).toEqual([]);
    login('new-session');
    await settle();
    expect(state.items()).toEqual(['EMAIL', 'PROVINCE']);
  });

  it('rechecks a visible card when the User store receives a successful profile update', async () => {
    login();
    await settle();
    TestBed.inject(ProfileStore).profile.set({
      id: 'owner',
      username: 'owner',
      displayName: 'Owner',
      email: 'owner@example.test',
      emailVerifiedAt: '2026-11-20T00:00:00Z',
      phone: null,
      phoneVerifiedAt: null,
      status: 'ACTIVE',
      province: { code: '01', name: 'Province' },
      avatarUrl: null,
      bio: null,
      followers: 0,
      following: 0,
      deletionRequestedAt: null,
      usernameChangedAt: null,
    });
    await settle();
    expect(api.evaluate).toHaveBeenCalledTimes(1);
    expect(state.items()).toEqual([]);
    expect(api.present).toHaveBeenCalledTimes(1);
  });
});
