import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SessionService } from '../../../core/auth/session.service';
import { UserApi } from '../../user/public-api';
import { ChatApi } from '../data-access/chat.api';
import type { ChatConversation, ChatMessage } from '../models/chat.models';
import { ConversationState } from './conversation.state';

const conversationId = 'dcfe86c5-6fb6-43fb-8f9b-b10847352f81';
const userId = 'dcfe86c5-6fb6-43fb-8f9b-b10847352f82';
const peerId = 'dcfe86c5-6fb6-43fb-8f9b-b10847352f83';
const conversation: ChatConversation = {
  id: conversationId,
  type: 'DIRECT',
  participants: [
    { userId, displayName: 'Một', status: 'ACTIVE' },
    { userId: peerId, displayName: 'Hai', status: 'ACTIVE' },
  ],
  listing: null,
  unreadCount: 0,
  hidden: false,
  createdAt: '2026-11-20T00:00:00Z',
  lastMessageAt: null,
};
const message: ChatMessage = {
  id: 'dcfe86c5-6fb6-43fb-8f9b-b10847352f84',
  conversationId,
  senderId: userId,
  requestId: 'dcfe86c5-6fb6-43fb-8f9b-b10847352f85',
  type: 'TEXT',
  content: 'Xin chào',
  createdAt: '2026-11-20T00:00:01Z',
  state: 'SENT',
  imagePath: null,
  proposal: null,
  snapshot: null,
};
const api = {
  get: vi.fn(),
  history: vi.fn(),
  send: vi.fn(),
  read: vi.fn(),
  upload: vi.fn(),
  cancel: vi.fn(),
  propose: vi.fn(),
  resolve: vi.fn(),
};

/** Tạo Promise có thể điều khiển thứ tự phản hồi để tái hiện stale response thực tế. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('ConversationState', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.get.mockResolvedValue(conversation);
    api.history.mockResolvedValue({ data: [], pagination: { nextCursor: null } });
    api.read.mockResolvedValue(undefined);
    api.send.mockResolvedValue(message);
    api.upload.mockResolvedValue('dcfe86c5-6fb6-43fb-8f9b-b10847352f86');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ConversationState,
        { provide: ChatApi, useValue: api },
        { provide: UserApi, useValue: { me: vi.fn().mockResolvedValue({ id: userId }) } },
      ],
    });
    TestBed.inject(SessionService).accept({
      accessToken: 'first',
      expiresIn: 900,
      status: 'ACTIVE',
    });
  });

  it('drops history from the previous account even when it resolves last', async () => {
    const old = deferred<{ data: ChatMessage[]; pagination: { nextCursor: null } }>();
    api.history.mockReturnValueOnce(old.promise);
    const state = TestBed.inject(ConversationState);
    const pending = state.load(conversationId);
    TestBed.inject(SessionService).accept({
      accessToken: 'second',
      expiresIn: 900,
      status: 'ACTIVE',
    });
    await state.load(conversationId);
    old.resolve({ data: [message], pagination: { nextCursor: null } });
    await pending;
    expect(state.messages()).toEqual([]);
    expect(api.read).not.toHaveBeenCalled();
  });

  it('keeps requestId and a successful image upload across network failure/retry', async () => {
    const state = TestBed.inject(ConversationState);
    await state.load(conversationId);
    api.send.mockRejectedValueOnce(new Error('Mất kết nối'));
    const file = new File(['image'], 'a.png', { type: 'image/png' });
    expect(await state.send('Tin nhắn', file)).toBe(false);
    expect(await state.send('Tin nhắn', file)).toBe(true);
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(api.send.mock.calls[0][1]).toEqual(api.send.mock.calls[1][1]);
    expect(state.messages()).toHaveLength(1);
  });

  it('prevents duplicate sends while one request is in flight', async () => {
    const state = TestBed.inject(ConversationState);
    await state.load(conversationId);
    const pending = deferred<ChatMessage>();
    api.send.mockReturnValueOnce(pending.promise);
    const sending = state.send('Xin chào', null);
    expect(await state.send('Xin chào', null)).toBe(false);
    pending.resolve(message);
    await sending;
    expect(api.send).toHaveBeenCalledTimes(1);
  });

  it('never attaches an old upload to a new account or conversation', async () => {
    const state = TestBed.inject(ConversationState);
    await state.load(conversationId);
    const pending = deferred<string>();
    api.upload.mockReturnValueOnce(pending.promise);
    const sending = state.send('', new File(['image'], 'a.png', { type: 'image/png' }));
    TestBed.inject(SessionService).accept({
      accessToken: 'second',
      expiresIn: 900,
      status: 'ACTIVE',
    });
    await state.load(peerId);
    pending.resolve(userId);
    expect(await sending).toBe(false);
    expect(api.send).not.toHaveBeenCalled();
  });

  it('merges REST/realtime reloads without duplicate messages and retains older pages', async () => {
    const state = TestBed.inject(ConversationState);
    api.history.mockResolvedValueOnce({ data: [message], pagination: { nextCursor: 'cursor' } });
    await state.load(conversationId);
    const older = { ...message, id: peerId, createdAt: '2026-11-19T00:00:01Z' };
    api.history.mockResolvedValueOnce({ data: [older], pagination: { nextCursor: null } });
    await state.older();
    api.history.mockResolvedValueOnce({ data: [message], pagination: { nextCursor: 'cursor' } });
    await state.load(conversationId);
    expect(state.messages().map((row) => row.id)).toEqual([older.id, message.id]);
  });

  it('restarts pagination when reconnect misses more than one page', async () => {
    const state = TestBed.inject(ConversationState);
    api.history.mockResolvedValueOnce({
      data: [message],
      pagination: { nextCursor: 'old-cursor' },
    });
    await state.load(conversationId);
    const recent = { ...message, id: peerId, createdAt: '2026-11-20T01:00:01Z' };
    api.history.mockResolvedValueOnce({ data: [recent], pagination: { nextCursor: 'new-cursor' } });
    await state.load(conversationId);
    expect(state.messages()).toEqual([recent]);
    expect(state.nextCursor()).toBe('new-cursor');
  });

  it('discards an old pagination response after reconnect replaces a discontinuous history', async () => {
    const state = TestBed.inject(ConversationState);
    api.history.mockResolvedValueOnce({
      data: [message],
      pagination: { nextCursor: 'old-cursor' },
    });
    await state.load(conversationId);
    const old = deferred<{ data: ChatMessage[]; pagination: { nextCursor: string } }>();
    api.history.mockReturnValueOnce(old.promise);
    const loading = state.older();
    const recent = { ...message, id: peerId, createdAt: '2026-11-20T01:00:01Z' };
    api.history.mockResolvedValueOnce({ data: [recent], pagination: { nextCursor: 'new-cursor' } });
    await state.load(conversationId);
    old.resolve({ data: [message], pagination: { nextCursor: 'stale-cursor' } });
    await loading;
    expect(state.messages()).toEqual([recent]);
    expect(state.nextCursor()).toBe('new-cursor');
  });
});
