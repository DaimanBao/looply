import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { SessionService } from '../../../core/auth/session.service';
import { ChatRealtime } from '../../chat/public-api';
import { NotificationApi } from '../data-access/notification.api';
import { NotificationState } from './notification.state';
import type { NotificationItem, NotificationPage } from '../models/notification.models';

const id = '6cdd4946-be64-4dd0-a6c7-31125305c975';
const item: NotificationItem = {
  id,
  type: 'MESSAGE',
  conversationId: id,
  listingId: null,
  proposalId: null,
  latestMessageId: id,
  lastEventId: id,
  isRead: false,
  createdAt: '2026-11-20T00:00:00Z',
  updatedAt: '2026-11-20T00:00:00Z',
};
const page: NotificationPage = {
  data: [item],
  pagination: { nextCursor: null },
  asOf: item.createdAt,
};

/** Điều khiển phản hồi để tái hiện race thay vì dùng sleep. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('NotificationState', () => {
  let state: NotificationState;
  let identity: number;
  let token: ReturnType<typeof signal<string | null>>;
  let active: ReturnType<typeof signal<boolean>>;
  let changes: Subject<string | null>;
  let api: {
    list: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    readAll: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    target: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    identity = 1;
    token = signal<string | null>('one');
    active = signal(true);
    changes = new Subject();
    api = {
      list: vi.fn().mockResolvedValue(page),
      count: vi.fn().mockResolvedValue(1),
      read: vi.fn().mockResolvedValue(undefined),
      readAll: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      target: vi.fn().mockResolvedValue({ conversationId: id, messageId: id }),
    };
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionService, useValue: { token, active, identityVersion: () => identity } },
        {
          provide: ChatRealtime,
          useValue: { notificationRevision: signal(0), notifications: changes.asObservable() },
        },
        { provide: NotificationApi, useValue: api },
        { provide: Router, useValue: { navigate } },
      ],
    });
    state = TestBed.inject(NotificationState);
    TestBed.tick();
    await state.refresh();
    vi.clearAllMocks();
  });

  it('rejects old account responses and clears private state on logout', async () => {
    const old = deferred<NotificationPage>();
    api.list.mockReturnValueOnce(old.promise);
    const pending = state.refresh();
    identity++;
    token.set('two');
    api.list.mockResolvedValue({ ...page, data: [] });
    api.count.mockResolvedValue(0);
    TestBed.tick();
    await state.refresh();
    old.resolve(page);
    await pending;
    expect(state.items()).toEqual([]);
    expect(state.count()).toBe(0);
    token.set(null);
    active.set(false);
    identity++;
    TestBed.tick();
    expect(state.items()).toEqual([]);
    expect(state.toast()).toBeNull();
  });

  it('drops older pagination after an invalidation refresh and deduplicates repeated rows', async () => {
    api.list.mockResolvedValueOnce({ ...page, pagination: { nextCursor: 'cursor' } });
    await state.refresh();
    const old = deferred<NotificationPage>();
    api.list.mockReturnValueOnce(old.promise);
    const pending = state.more();
    await state.refresh();
    old.resolve({ ...page, data: [{ ...item, id: '6cdd4946-be64-4dd0-a6c7-31125305c976' }] });
    await pending;
    expect(state.items()).toEqual([item]);
    expect(state.loadingMore()).toBe(false);
  });

  it('prevents duplicate mutations and sends the captured event boundary', async () => {
    const wait = deferred<void>();
    api.read.mockReturnValueOnce(wait.promise);
    const first = state.read(item);
    await state.read(item);
    expect(api.read).toHaveBeenCalledTimes(1);
    expect(api.read).toHaveBeenCalledWith(item);
    wait.resolve();
    await first;
    expect(state.busy()).toBe(false);
    await state.readAll();
    expect(api.readAll).toHaveBeenCalledWith(page.asOf);
  });

  it('never reads or navigates using a target response belonging to an old account', async () => {
    const wait = deferred<{ conversationId: string; messageId: string | null }>();
    api.target.mockReturnValueOnce(wait.promise);
    const pending = state.open(item);
    identity++;
    token.set('two');
    wait.resolve({ conversationId: id, messageId: id });
    await pending;
    expect(api.read).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('closes toast without marking read and does not toast read/delete invalidations', async () => {
    changes.next(id);
    expect(state.toast()).toBe(id);
    state.dismissToast();
    expect(api.read).not.toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
    changes.next(null);
    expect(state.toast()).toBeNull();
    await state.refresh();
  });

  it('keeps unavailable targets on the notification page and reports an error', async () => {
    api.target.mockRejectedValueOnce(new Error('Unavailable'));
    await state.open(item);
    expect(state.error()).not.toBe('');
    expect(navigate).not.toHaveBeenCalled();
    expect(api.read).not.toHaveBeenCalled();
  });

  it('refreshes a stale grouped notification and explains the read conflict', async () => {
    api.read.mockRejectedValueOnce(new HttpErrorResponse({ status: 409 }));
    await state.read(item);
    expect(api.list).toHaveBeenCalled();
    expect(state.error()).toContain('hoạt động mới');
  });

  it('opens authorized conversation and card only after successful mark-read', async () => {
    await state.open(item);
    expect(api.read).toHaveBeenCalledWith(item);
    expect(navigate).toHaveBeenCalledWith(['/chat', id], { queryParams: { messageId: id } });
  });
});
