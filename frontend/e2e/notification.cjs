const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BrowserPage } = require('./cdp.cjs');

/** Luồng Notification thật dùng hai browser, REST/Socket.IO, PostgreSQL và Redis test đã xác minh. */
module.exports = async function notification({
  page,
  fixture,
  owner,
  listing,
  passed,
  start,
  ready,
  directory,
  artifacts,
  browser,
}) {
  const contact = await fixture.user();
  const replacement = await fixture.user();
  start(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--remote-debugging-port=9231',
      `--user-data-dir=${path.join(directory, 'chrome-notification-owner')}`,
      'about:blank',
    ],
    {},
  );
  await ready('http://127.0.0.1:9231/json/version');
  const tabs = await (await fetch('http://127.0.0.1:9231/json')).json();
  const recipient = await BrowserPage.connect(
    tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl,
  );

  /** Đăng nhập qua form thật, không đưa credential vào log/artifacts. */
  async function login(target, user, returnUrl) {
    await target.navigate(
      `/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`,
      `!!document.querySelector('input[formcontrolname=username]')`,
    );
    await target.fill('input[formcontrolname=username]', user.username);
    await target.fill('input[formcontrolname=password]', 'Fixture passphrase 928!');
    await target.click('Đăng nhập');
    await target.wait(
      `location.pathname === ${JSON.stringify(returnUrl)} && !document.querySelector('input[formcontrolname=username]')`,
      'login return',
    );
  }

  /** Chạy worker thật sau khi UI xác nhận persistence của producer. */
  async function drain() {
    for (let index = 0; index < 50; index++)
      if (!(await fixture.notifications.worker.runOnce())) return;
    throw new Error('Unexpected notification backlog');
  }

  /** Chờ heartbeat thật trước assertion suppress; không suy presence từ việc online. */
  async function viewing(conversationId) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      if (await fixture.notifications.presence.isViewing(owner.id, conversationId)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Missing authenticated conversation presence');
  }

  /** Gửi bằng composer rồi đợi tin nhắn hiển thị trước khi xử lý outbox. */
  async function send(text) {
    await page.fill('#chat-content', text);
    await page.click('Gửi tin nhắn');
    await page.wait(
      `document.querySelector('.messages')?.textContent.includes(${JSON.stringify(text)}) && !document.querySelector('#chat-content')?.value`,
      'persisted message',
    );
    await drain();
  }

  try {
    await login(page, contact, `/listings/${listing.id}`);
    await page.wait(
      `!!document.querySelector('app-start-chat button:not(:disabled)')`,
      'start conversation',
    );
    await page.click('Nhắn tin');
    await page.wait(`!!document.querySelector('#chat-content')`, 'composer');
    const conversationId = await page.evaluate('location.pathname.split("/").at(-1)');
    await login(recipient, owner, '/account/notifications');
    await recipient.wait(
      `!!document.querySelector('app-notification-center .badge')`,
      'notification center',
    );
    await send('Nội dung tin riêng tư đầu tiên');
    await recipient.wait(
      `document.querySelector('app-notification-center .badge')?.textContent.trim() === '1' && !!document.querySelector('.notification-toast') && document.querySelectorAll('.notifications li').length === 1`,
      'persisted realtime toast and badge',
    );
    assert.equal(
      await recipient.evaluate(
        `document.body.textContent.includes('Nội dung tin riêng tư đầu tiên')`,
      ),
      false,
    );
    await recipient.evaluate(`document.querySelector('.notification-toast button').click()`);
    assert.equal(
      await recipient.evaluate(
        `document.querySelector('app-notification-center .badge').textContent.trim()`,
      ),
      '1',
    );
    const previousUpdate = await recipient.evaluate(
      `document.querySelector('.notifications time').getAttribute('datetime')`,
    );
    await send('Nội dung tin riêng tư thứ hai');
    await recipient.wait(
      `document.querySelectorAll('.notifications li').length === 1 && document.querySelector('app-notification-center .badge')?.textContent.trim() === '1' && document.querySelector('.notifications time')?.getAttribute('datetime') !== ${JSON.stringify(previousUpdate)}`,
      'grouped message notification',
    );
    passed('Real login, grouped MESSAGE, recipient-only realtime badge and toast without preview');

    await recipient.evaluate(`document.querySelector('.notifications .notification-link').click()`);
    await recipient.wait(
      `location.pathname === '/chat/${conversationId}' && document.querySelector('.notification-target')?.textContent.includes('thứ hai')`,
      'notification target and mark-read',
    );
    await viewing(conversationId);
    await send('Tin khi người nhận đang xem');
    await recipient.wait(
      `document.querySelector('.messages')?.textContent.includes('Tin khi người nhận đang xem')`,
      'message while viewing',
    );
    assert.equal(
      await recipient.evaluate(
        `document.querySelector('app-notification-center .badge').textContent.trim()`,
      ),
      '0',
    );
    passed(
      'Notification opens the exact message, read badge updates and visible Conversation suppresses MESSAGE',
    );

    await recipient.navigate(
      '/account/notifications',
      `!!document.querySelector('#notifications-title')`,
    );
    await send('Tin sau khi rời Conversation');
    await recipient.wait(
      `document.querySelector('app-notification-center .badge')?.textContent.trim() === '1'`,
      'notification after leave',
    );
    await recipient.click('Đánh dấu tất cả đã đọc');
    await recipient.wait(
      `document.querySelector('app-notification-center .badge')?.textContent.trim() === '0'`,
      'read all',
    );
    await send('Tin để xóa thông báo');
    await recipient.wait(
      `document.querySelector('.notifications .unread')`,
      'new unread notification',
    );
    await recipient.evaluate(
      `document.querySelector('.notifications .unread .actions button:last-child').click()`,
    );
    await recipient.click('Xác nhận xóa');
    await recipient.wait(
      `document.querySelector('app-notification-center .badge')?.textContent.trim() === '0'`,
      'soft delete',
    );
    assert.equal(await fixture.db.message.count({ where: { conversationId } }), 5);
    passed(
      'Leave restores notifications; read-all and confirmed soft delete preserve Chat history',
    );

    await page.evaluate(`document.querySelector('.proposal-toggle').click()`);
    await page.fill('#proposed-price', '99000');
    await page.click('Đề xuất giá mới');
    await page.click('Xác nhận gửi');
    await page.wait(`!!document.querySelector('.transaction-card')`, 'proposal persisted');
    await drain();
    await recipient.wait(
      `document.querySelector('.notifications .unread .notification-link')?.textContent.includes('giao dịch')`,
      'proposal notification',
    );
    await recipient.evaluate(
      `document.querySelector('.notifications .unread .notification-link').click()`,
    );
    await recipient.wait(
      `!!document.querySelector('.notification-target .transaction-card')`,
      'card target',
    );
    await recipient.click('Chấp nhận');
    await recipient.click('Xác nhận');
    await recipient.wait(
      `document.querySelector('.transaction-card')?.textContent.includes('Đã chấp nhận')`,
      'accepted proposal',
    );
    await drain();
    await page.wait(
      `document.querySelector('app-notification-center .badge')?.textContent.trim() === '1'`,
      'proposal result notification',
    );
    passed(
      'Proposal creation and acceptance create TRANSACTION notifications with exact card navigation',
    );

    const session = await fixture.db.$transaction((tx) => fixture.sessions.create(contact, tx));
    const principal = await fixture.sessions.authenticate(session.accessToken);
    for (let index = 0; index < 31; index++) {
      await fixture.chat.messages.send(principal, conversationId, {
        requestId: require('node:crypto').randomUUID(),
        content: `Tin mới hơn card ${index}`,
      });
    }
    await drain();
    await recipient.navigate(
      '/account/notifications',
      `!!document.querySelector('.notifications')`,
    );
    await recipient.evaluate(
      `Array.from(document.querySelectorAll('.notification-link')).find(element=>element.textContent.includes('giao dịch')).click()`,
    );
    await recipient.wait(
      `!!document.querySelector('.notification-target .transaction-card')`,
      'card beyond first history page',
    );
    passed(
      'Old transaction card navigation loads older Chat keyset pages without losing the target',
    );

    for (const width of [1440, 390]) {
      await recipient.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 500,
      });
      await recipient.navigate(
        '/account/notifications',
        `!!document.querySelector('#notifications-title')`,
      );
      assert.equal(
        await recipient.evaluate('document.documentElement.scrollWidth <= innerWidth'),
        true,
      );
      const screenshot = await recipient.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(
        path.join(artifacts, `notification-${width}.png`),
        Buffer.from(screenshot.data, 'base64'),
      );
    }
    await recipient.navigate(
      '/account/notifications',
      `document.querySelectorAll('.notifications li').length > 0`,
    );
    await recipient.click('Đăng xuất');
    await recipient.wait(`location.pathname === '/auth/login'`, 'logout');
    await login(recipient, replacement, '/account/notifications');
    await recipient.wait(
      `document.body.textContent.includes('Bạn chưa có thông báo nào.')`,
      'new account empty state',
    );
    assert.equal(
      await recipient.evaluate(
        `document.querySelector('app-notification-center .badge').textContent.trim()`,
      ),
      '0',
    );
    passed(
      'Notification reload, responsive 1440/390 layout and account switch isolate private state',
    );
  } catch (error) {
    fs.writeFileSync(
      path.join(artifacts, 'notification-debug.json'),
      JSON.stringify(
        {
          location: await recipient.evaluate('location.pathname + location.search'),
          alerts: await recipient.evaluate(
            `Array.from(document.querySelectorAll('[role=alert]')).map(element=>element.textContent)`,
          ),
          targets: await recipient.evaluate(
            `Array.from(document.querySelectorAll('.notification-target')).map(element=>element.id)`,
          ),
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    try {
      await recipient.send('Browser.close');
    } catch {
      /* Browser có thể đã đóng. */
    }
    recipient.close();
  }
};
