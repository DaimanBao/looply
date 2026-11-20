const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

/** Bổ sung kiểm chứng UX trên luồng Chat thật; chỉ dùng dữ liệu và server của fixture test. */
module.exports = async function chatUi({
  page,
  ownerPage,
  fixture,
  contact,
  owner,
  conversationId,
  chatRealtime,
  passed,
  artifacts,
}) {
  const ownerSession = await fixture.db.$transaction((tx) => fixture.sessions.create(owner, tx));
  const ownerPrincipal = await fixture.sessions.authenticate(ownerSession.accessToken);
  const contactSession = await fixture.db.$transaction((tx) =>
    fixture.sessions.create(contact, tx),
  );
  const contactPrincipal = await fixture.sessions.authenticate(contactSession.accessToken);

  /** Đo giao diện và chụp screenshot cùng breakpoint; không đọc token hoặc thông tin liên hệ. */
  async function screenshot(width, suffix) {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 720,
    });
    await page.wait(
      'document.querySelector(".composer")?.getBoundingClientRect().bottom <= innerHeight',
      'composer inside viewport',
    );
    await page.wait(
      `!document.querySelector('.conversation-loading')`,
      'conversation content settled',
    );
    if (await page.evaluate(`!!document.querySelector('.transaction-card')`))
      await page.wait(
        `document.querySelector('.transaction-card img')?.naturalWidth > 0`,
        'snapshot image loaded',
      );
    await page.wait(
      `(()=>{const e=document.querySelector('.messages');return e.scrollHeight-e.scrollTop-e.clientHeight<96})()`,
      'latest remains visible after images and viewport resize',
    );
    assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    const metrics = await page.evaluate(
      `(()=>{const inbox=document.querySelector('.inbox-panel').getBoundingClientRect();const active=document.querySelector('.conversation-panel').getBoundingClientRect();return {inbox:inbox.width,active:active.width,body:document.documentElement.scrollHeight,height:innerHeight}})()`,
    );
    if (width > 720)
      assert.ok(
        metrics.inbox > 250 && metrics.active > metrics.inbox,
        'Desktop must have two columns',
      );
    else assert.equal(metrics.inbox, 0, 'Mobile selected conversation hides Inbox');
    assert.ok(metrics.body <= metrics.height + 1, 'Chat scrolls inside panels, not body');
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(
      path.join(artifacts, `chat-ui-${suffix}-${width}.png`),
      Buffer.from(shot.data, 'base64'),
    );
  }

  try {
    for (const width of [1440, 900, 390]) await screenshot(width, 'conversation');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const sidebar = await page.evaluate(
      `document.querySelector('app-inbox input[type=search]') !== null`,
    );
    assert.equal(sidebar, true);
    await page.fill('app-inbox input[type=search]', 'khong-co-hoi-thoai-nay');
    await page.wait(
      `document.querySelector('.inbox-empty')?.textContent.includes('Không tìm thấy')`,
      'local Inbox search empty',
    );
    await page.fill('app-inbox input[type=search]', '');
    await page.wait(
      `!!document.querySelector('.conversation-row.selected')`,
      'selected conversation',
    );
    passed(
      'Chat desktop/tablet/mobile has independent panels, selected row, local search and composer inside viewport',
    );

    await page.fill('#chat-content', 'Tin gửi bằng Enter 😀');
    await page.evaluate(
      `document.querySelector('#chat-content').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`,
    );
    await page.wait(
      `document.querySelector('.messages')?.textContent.includes('Tin gửi bằng Enter 😀') && !document.querySelector('#chat-content').value`,
      'Enter sends',
    );
    await page.fill('#chat-content', 'Bản nháp còn nguyên');
    await page.evaluate(
      `document.querySelector('#chat-content').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}))`,
    );
    assert.equal(
      await page.evaluate(`document.querySelector('#chat-content').value`),
      'Bản nháp còn nguyên',
    );
    await page.fill('#chat-content', '');
    passed('Enter sends Unicode text; Shift+Enter keeps the composer draft without submitting');

    for (let index = 0; index < 55; index++)
      await fixture.chat.messages.send(ownerPrincipal, conversationId, {
        requestId: randomUUID(),
        content: `Lịch sử kiểm thử ${index}`,
      });
    await page.wait(
      `document.querySelector('.messages')?.textContent.includes('Lịch sử kiểm thử 54')`,
      'realtime history burst',
    );
    await page.navigate(
      `/chat/${conversationId}`,
      `document.querySelector('.messages')?.textContent.includes('Lịch sử kiểm thử 54') && !!document.querySelector('.older-button')`,
    );
    await page.evaluate(
      `document.querySelector('.messages').scrollTop=120;document.querySelector('.messages').dispatchEvent(new Event('scroll'))`,
    );
    const oldTop = await page.evaluate(`document.querySelector('.messages').scrollTop`);
    await fixture.chat.messages.send(ownerPrincipal, conversationId, {
      requestId: randomUUID(),
      content: 'Tin mới khi đang đọc lịch sử',
    });
    await page.wait(`!!document.querySelector('.new-messages')`, 'new-message indicator');
    assert.ok(
      Math.abs((await page.evaluate(`document.querySelector('.messages').scrollTop`)) - oldTop) < 6,
      'Receiving does not force scroll',
    );
    await page.click('↓ Tin nhắn mới');
    await page.wait(
      `(()=>{const e=document.querySelector('.messages');return e.scrollHeight-e.scrollTop-e.clientHeight<96})()`,
      'return to latest',
    );
    const before = await page.evaluate(
      `(()=>{const v=document.querySelector('.messages');const e=v.querySelector('.message');return {id:e.id,count:v.querySelectorAll('.message').length}})()`,
    );
    await page.evaluate(
      `const v=document.querySelector('.messages');v.scrollTop=0;v.dispatchEvent(new Event('scroll'))`,
    );
    await page.wait(
      `document.querySelectorAll('.messages .message').length > ${before.count}`,
      'older page prepended',
    );
    assert.ok(
      await page.evaluate(
        `(()=>{const v=document.querySelector('.messages');const e=document.getElementById(${JSON.stringify(before.id)});return Math.abs(e.getBoundingClientRect().top-v.getBoundingClientRect().top)<150})()`,
      ),
      'Prepend preserves visible anchor',
    );
    passed(
      'Realtime burst deduplicates, respects old-history reading and cursor prepend preserves scroll position',
    );

    const oldSockets = new Set([...chatRealtime.io.of('/chat').sockets.keys()]);
    chatRealtime.io.of('/chat').disconnectSockets(true);
    const until = Date.now() + 15000;
    while (
      Date.now() < until &&
      ![...chatRealtime.io.of('/chat').sockets.keys()].some((id) => !oldSockets.has(id))
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(
      [...chatRealtime.io.of('/chat').sockets.keys()].some((id) => !oldSockets.has(id)),
      'Reconnection must create an authenticated socket',
    );
    await page.wait(
      `document.querySelector('.chat-header')?.textContent.includes('Đã kết nối Chat')`,
      'authenticated reconnect',
    );
    passed(
      'Server disconnect refreshes the session, reconnects Socket.IO and keeps persisted history',
    );

    const direct = await fixture.chat.conversations.create(contactPrincipal, {
      type: 'DIRECT',
      userId: owner.id,
    });
    await page.click('Hội thoại tự do');
    await page.wait(
      `!!document.querySelector('.conversation-row a[href="/chat/${direct.id}"]')`,
      'DIRECT inbox group',
    );
    await page.evaluate(
      `document.querySelector('.conversation-row a[href="/chat/${direct.id}"]').click()`,
    );
    await page.wait(
      `location.pathname === '/chat/${direct.id}' && !!document.querySelector('#chat-content') && !document.querySelector('.chat-context')`,
      'DIRECT navigation without listing',
    );
    assert.equal(
      await page.evaluate(`!!document.querySelector('.conversation-row.selected')`),
      true,
    );
    await page.click('Ẩn hội thoại');
    await page.wait(`document.querySelector('dialog')?.open`, 'hide confirmation dialog');
    await page.evaluate(`document.querySelector('dialog').dispatchEvent(new Event('cancel'))`);
    await page.wait(`!document.querySelector('dialog').open`, 'cancel hide');
    await page.click('Ẩn hội thoại');
    await page.click('Xác nhận ẩn');
    await page.wait(
      `location.pathname === '/chat' && !document.querySelector('.conversation-row a[href="/chat/${direct.id}"]')`,
      'hide own Inbox',
    );
    const hidden = await fixture.db.conversationParticipant.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId: direct.id, userId: contact.id } },
    });
    assert.ok(hidden.hiddenAt);
    await fixture.chat.messages.send(ownerPrincipal, direct.id, {
      requestId: randomUUID(),
      content: 'Khôi phục hội thoại đã ẩn',
    });
    await page.wait(
      `!!document.querySelector('.conversation-row .unread-badge')`,
      'unread restored row',
    );
    await page.evaluate(
      `document.querySelector('.conversation-row a[href="/chat/${direct.id}"]').click()`,
    );
    await page.wait(
      `document.querySelector('.messages')?.textContent.includes('Khôi phục hội thoại đã ẩn')`,
      'open restored history',
    );
    await screenshot(390, 'direct');
    await page.evaluate(`document.querySelector('.back-button').click()`);
    await page.wait(
      `location.pathname === '/chat' && document.querySelector('.inbox-panel').getBoundingClientRect().width > 0`,
      'mobile back to Inbox',
    );
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(
      path.join(artifacts, 'chat-ui-inbox-390.png'),
      Buffer.from(shot.data, 'base64'),
    );
    passed(
      'DIRECT navigation, hide/cancel/restore, unread and mobile back preserve existing Chat rules',
    );
    await page.navigate(`/chat/${conversationId}`, `!!document.querySelector('#chat-content')`);
  } catch (error) {
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifacts, 'chat-ui-failure.png'), Buffer.from(shot.data, 'base64'));
    throw error;
  }
};
