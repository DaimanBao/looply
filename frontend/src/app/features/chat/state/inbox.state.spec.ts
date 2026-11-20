import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { SessionService } from '../../../core/auth/session.service';
import { UserApi } from '../../user/public-api';
import { ChatApi } from '../data-access/chat.api';
import { ChatRealtime } from './chat-realtime';
import { InboxState } from './inbox.state';
import type { ChatConversation, ChatPage } from '../models/chat.models';

const row: ChatConversation = {
  id: 'chat',
  type: 'DIRECT',
  participants: [
    { userId: 'me', displayName: 'Tên của tôi', status: 'ACTIVE' },
    { userId: 'peer', displayName: 'Người đối thoại', status: 'ACTIVE' },
  ],
  listing: null,
  unreadCount: 1,
  hidden: false,
  lastMessageAt: null,
  createdAt: '2026-11-20T00:00:00Z',
};
const page: ChatPage<ChatConversation> = { data: [row], pagination: { nextCursor: null } };

/** Promise điều khiển thứ tự hoàn tất để tái hiện phản hồi cũ sau đổi danh tính/filter. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('InboxState', () => {
  let state: InboxState;
  let api: { inbox: ReturnType<typeof vi.fn>; hide: ReturnType<typeof vi.fn> };
  let session: SessionService;
  beforeEach(async () => {
    api = { inbox: vi.fn().mockResolvedValue(page), hide: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        InboxState,
        { provide: ChatApi, useValue: api },
        { provide: UserApi, useValue: { me: vi.fn().mockResolvedValue({ id: 'me' }) } },
        { provide: ChatRealtime, useValue: { revision: signal(0) } },
      ],
    });
    session = TestBed.inject(SessionService);
    session.accept({ accessToken: 'one', status: 'ACTIVE', expiresIn: 900 });
    state = TestBed.inject(InboxState);
    state.group.set('DIRECT');
    TestBed.tick();
    await state.load();
  });

  it('uses the other participant and searches only loaded names/listings', () => {
    expect(state.peer(row)?.displayName).toBe('Người đối thoại');
    state.search.set('NGƯỜI ĐỐI');
    expect(state.groups()[0].rows).toEqual([row]);
    state.search.set('Tên của tôi');
    expect(state.groups()).toEqual([]);
  });

  it('keeps the existing list visible while refreshing and deduplicates pagination', async () => {
    const wait = deferred<ChatPage<ChatConversation>>();
    api.inbox.mockReturnValueOnce(wait.promise);
    const pending = state.load();
    expect(state.rows()).toEqual([row]);
    wait.resolve({ data: [row], pagination: { nextCursor: 'cursor' } });
    await pending;
    await state.load(true);
    expect(state.rows()).toHaveLength(1);
  });

  it('drops stale pagination after switching to another account', async () => {
    const wait = deferred<ChatPage<ChatConversation>>();
    api.inbox.mockResolvedValueOnce({ ...page, pagination: { nextCursor: 'cursor' } });
    await state.load();
    api.inbox.mockReturnValueOnce(wait.promise);
    const pending = state.load(true);
    session.accept({ accessToken: 'two', status: 'ACTIVE', expiresIn: 900 });
    api.inbox.mockResolvedValue({ data: [], pagination: { nextCursor: null } });
    TestBed.tick();
    await state.load();
    wait.resolve(page);
    await pending;
    expect(state.rows()).toEqual([]);
    expect(state.next()).toBeNull();
  });

  it('prevents duplicate hides and clears the selected listing filter for DIRECT deep links', async () => {
    const wait = deferred<void>();
    api.hide.mockReturnValueOnce(wait.promise);
    const hiding = state.hide(row.id);
    expect(await state.hide(row.id)).toBe(false);
    expect(api.hide).toHaveBeenCalledTimes(1);
    wait.resolve();
    await hiding;
    state.group.set('LISTING');
    state.listingId.set('another-listing');
    state.reveal(row);
    expect(state.group()).toBe('DIRECT');
    expect(state.listingId()).toBe('');
  });

  it('does not navigate on an old hide when account changes during the following refresh', async () => {
    const wait = deferred<ChatPage<ChatConversation>>();
    api.inbox.mockReturnValueOnce(wait.promise);
    const hiding = state.hide(row.id);
    await Promise.resolve();
    session.accept({ accessToken: 'two', status: 'ACTIVE', expiresIn: 900 });
    api.inbox.mockResolvedValue({ data: [], pagination: { nextCursor: null } });
    TestBed.tick();
    wait.resolve(page);
    expect(await hiding).toBe(false);
    expect(state.rows()).not.toContain(row);
  });
});
