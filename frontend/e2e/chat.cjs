const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BrowserPage } = require('./cdp.cjs');

/** Demo hai browser context độc lập dùng form login, HTTP, Socket.IO, PostgreSQL và storage thật. */
module.exports = async function chat({
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
  image,
}) {
  const contact = await fixture.user();
  const secondUser = await fixture.user();
  start(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--remote-debugging-port=9231',
      `--user-data-dir=${path.join(directory, 'chrome-chat-owner')}`,
      'about:blank',
    ],
    {},
  );
  await ready('http://127.0.0.1:9231/json/version');
  const tabs = await (await fetch('http://127.0.0.1:9231/json')).json();
  const ownerPage = await BrowserPage.connect(
    tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl,
  );
  try {
    /** Đăng nhập qua form thực; credential fixture không in ra log hay lưu vào report. */
    async function login(browserPage, user, returnUrl) {
      await browserPage.navigate(
        `/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`,
        `!!document.querySelector('input[formcontrolname=username]')`,
      );
      await browserPage.fill('input[formcontrolname=username]', user.username);
      await browserPage.fill('input[formcontrolname=password]', 'Fixture passphrase 928!');
      await browserPage.click('Đăng nhập');
      await browserPage.wait(
        `location.pathname === ${JSON.stringify(returnUrl)} && !document.querySelector('input[formcontrolname=username]')`,
        'login return',
      );
    }
    await page.navigate(
      `/listings/${listing.id}`,
      `!!document.querySelector('app-start-chat button')`,
    );
    await page.click('Nhắn tin');
    await page.wait(`location.pathname === '/auth/login'`, 'guest chat invitation');
    await login(page, contact, `/listings/${listing.id}`);
    await page.wait(
      `!!document.querySelector('app-start-chat button:not(:disabled)')`,
      'chat start control',
    );
    await page.click('Nhắn tin');
    await page.wait(`!!document.querySelector('#chat-content')`, 'conversation composer');
    const conversationId = await page.evaluate('location.pathname.split("/").at(-1)');
    passed('Guest invitation, real login and unique Listing conversation');

    await login(ownerPage, owner, '/chat');
    await ownerPage.wait(
      `!!document.querySelector('a[href="/chat/${conversationId}"]')`,
      'owner inbox listing group',
    );
    await ownerPage.evaluate(`document.querySelector('a[href="/chat/${conversationId}"]').click()`);
    await ownerPage.wait(
      `!!document.querySelector('#chat-content') && document.body.textContent.includes('Đã kết nối Chat')`,
      'owner realtime connection',
    );
    await page.fill('#chat-content', 'Xin chào chủ bài 😀');
    await page.click('Gửi tin nhắn');
    await ownerPage.wait(
      `document.querySelector('.messages').textContent.includes('Xin chào chủ bài 😀')`,
      'live message from contact',
    );
    await page.wait(
      `document.querySelector('.messages').textContent.includes('Đã xem')`,
      'read receipt from owner',
    );
    await ownerPage.fill('#chat-content', 'Chào bạn, sản phẩm vẫn còn.');
    await ownerPage.click('Gửi tin nhắn');
    await page.wait(
      `document.querySelector('.messages').textContent.includes('Chào bạn, sản phẩm vẫn còn.')`,
      'live owner reply',
    );
    passed(
      'Two independent sessions exchange persisted messages and read receipts through realtime',
    );

    const imagePath = path.join(directory, 'chat-image.png');
    fs.writeFileSync(imagePath, image);
    await page.send('DOM.enable');
    const document = await page.send('DOM.getDocument');
    const input = await page.send('DOM.querySelector', {
      nodeId: document.root.nodeId,
      selector: '#chat-image',
    });
    await page.send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [imagePath] });
    await page.wait(`!!document.querySelector('.preview')`, 'local image preview');
    await page.click('Gửi tin nhắn');
    await ownerPage.wait(
      `document.querySelector('.messages app-chat-image img')?.naturalWidth > 0`,
      'authorized chat image delivery',
    );
    passed('Image preview/upload/message attachment and authorized Blob delivery');

    await page.fill('#proposed-price', '99000');
    await page.click('Đề xuất giá mới');
    await page.click('Xác nhận gửi');
    await ownerPage.wait(
      `document.querySelector('.transaction-card')?.textContent.includes('99000')`,
      'proposal card delivered',
    );
    await ownerPage.click('Chấp nhận');
    await ownerPage.click('Xác nhận');
    await page.wait(
      `document.querySelector('.transaction-card')?.textContent.includes('Đã chấp nhận') && document.querySelector('.chat-context').textContent.includes('HIDDEN')`,
      'accepted card and hidden listing',
    );
    passed('Proposal snapshot accepted atomically and Listing hidden in both clients');

    for (const width of [1440, 390]) {
      await page.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 500,
      });
      assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(
        path.join(artifacts, `chat-${width}.png`),
        Buffer.from(screenshot.data, 'base64'),
      );
    }
    passed('Chat responsive layout at 1440/390 pixels');
    await page.navigate(`/chat/${conversationId}`, `!!document.querySelector('.transaction-card')`);
    await page.wait(
      `document.querySelector('.messages').textContent.includes('Xin chào chủ bài 😀')`,
      'history after page reload',
    );
    await page.click('Đăng xuất');
    await page.wait(`location.pathname === '/auth/login'`, 'contact logout');
    await login(page, secondUser, '/chat');
    assert.equal(
      await page.evaluate(`document.body.textContent.includes('Xin chào chủ bài 😀')`),
      false,
    );
    await page.navigate(`/chat/${conversationId}`, `!!document.querySelector('p[role=alert]')`);
    assert.equal(await page.evaluate(`!!document.querySelector('.messages')`), false);
    passed(
      'Reload restores history; account switch drops old data and denies cross-conversation access',
    );
  } finally {
    try {
      await ownerPage.send('Browser.close');
    } catch {
      /* Browser đã thoát thì không cần đóng lại. */
    }
    ownerPage.close();
  }
};
