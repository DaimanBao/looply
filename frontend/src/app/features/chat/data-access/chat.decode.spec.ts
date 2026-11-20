import { decodeChatPage, decodeConversation, decodeMessage } from './chat.decode';

describe('Chat contract decoders', () => {
  it('rejects untrusted message shapes and foreign media URLs', () => {
    const id = 'dcfe86c5-6fb6-43fb-8f9b-b10847352f81';
    const message = {
      id,
      conversationId: id,
      senderId: id,
      requestId: id,
      type: 'TEXT',
      content: '<script>test</script>',
      createdAt: '2026-11-20T00:00:00Z',
      state: 'SENT',
      imagePath: null,
      proposal: null,
      snapshot: null,
    };
    expect(decodeMessage(message).content).toBe(message.content);
    for (const invalid of [
      { ...message, imagePath: 'https://other.test/a.png' },
      { ...message, imagePath: `/api/conversations/${id}/../../auth/refresh` },
      { ...message, state: 'READ_BY_ALL' },
      { ...message, id: '../private' },
      { ...message, createdAt: 'invalid' },
    ])
      expect(() => decodeMessage(invalid)).toThrow();
  });

  it('rejects invalid pages and unread state', () => {
    expect(() =>
      decodeChatPage({ data: 'invalid', pagination: { nextCursor: null } }, decodeConversation),
    ).toThrow();
    expect(() => decodeConversation({ participants: [], unreadCount: -1 })).toThrow();
  });
});
