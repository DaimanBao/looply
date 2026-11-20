const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BrowserPage } = require('./cdp.cjs');

/** Nghiệm thu Reminder qua Chrome, Auth/User API, Redis và PostgreSQL test thật. */
module.exports = async function reminder({ page, fixture, owner, artifacts, passed }) {
  await fixture.db.user.update({
    where: { id: owner.id },
    data: { phone: null, phoneVerifiedAt: null },
  });
  const province = await fixture.province();
  /** Chờ document mới thật sự khi reload cùng đường dẫn, tránh nhận nhầm DOM trang cũ. */
  async function navigate(url, condition) {
    await page.evaluate('window.__reminderPreviousDocument = true');
    await page.navigate(url, `!window.__reminderPreviousDocument && (${condition})`);
  }
  /** Dùng form đăng nhập thật; không ghi credential hoặc OTP vào report. */
  async function login(user = owner) {
    await navigate(
      '/auth/login?returnUrl=/account',
      `!!document.querySelector('input[formcontrolname=username]')`,
    );
    await page.fill('input[formcontrolname=username]', user.username);
    await page.fill('input[formcontrolname=password]', 'Fixture passphrase 928!');
    await page.click('Đăng nhập');
    await page.wait(
      `location.pathname === '/account' && !document.querySelector('input[formcontrolname=username]')`,
      'login',
    );
  }
  await navigate('/', `!!document.querySelector('input[type=search]')`);
  assert.equal(await page.evaluate(`!!document.querySelector('app-reminder-card aside')`), false);
  await login();
  await page.wait(
    `document.querySelectorAll('app-reminder-card li').length === 3`,
    'three missing fields',
  );
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
      path.join(artifacts, `reminder-${width}.png`),
      Buffer.from(screenshot.data, 'base64'),
    );
  }
  passed('Guest quiet; real login shows one grouped card, responsive 1440/390');

  const tab = await page.send('Target.createTarget', { url: 'about:blank' });
  const tabs = await (await fetch('http://127.0.0.1:9230/json')).json();
  const second = await BrowserPage.connect(
    tabs.find((item) => item.id === tab.targetId).webSocketDebuggerUrl,
  );
  try {
    await second.navigate(
      '/account',
      `!!document.querySelector('app-avatar') && !document.querySelector('app-reminder-card .status')`,
    );
    assert.equal(
      await second.evaluate(`!!document.querySelector('app-reminder-card aside')`),
      false,
    );
  } finally {
    second.close();
    await page.send('Target.closeTarget', { targetId: tab.targetId });
  }
  passed('Second tab shares the same Auth session without another card');

  await page.evaluate(`document.querySelector('app-reminder-card a[href*="kind=email"]').click()`);
  await page.wait(
    `location.pathname === '/account/contacts' && !!document.querySelector('input[type=email]')`,
    'email destination',
  );
  assert.equal(await page.evaluate(`!!document.querySelector('app-reminder-card aside')`), false);
  await navigate(
    '/account',
    `!!document.querySelector('app-avatar') && !document.querySelector('app-reminder-card .status')`,
  );
  assert.equal(await page.evaluate(`!!document.querySelector('app-reminder-card aside')`), false);
  await navigate('/account/contacts?kind=phone', `!!document.querySelector('input[type=tel]')`);
  passed(
    'Update action selects email/phone form; route changes and cookie restore do not repeat card',
  );

  await page.click('Đăng xuất');
  await page.wait(`location.pathname === '/auth/login'`, 'logout');
  await login();
  await page.wait(`document.querySelectorAll('app-reminder-card li').length === 3`, 'new session');
  await page.evaluate(`document.querySelector('app-reminder-card a[href$="#province"]').click()`);
  await page.wait(`document.activeElement?.id === 'province'`, 'province focus');
  await page.fill('select[formcontrolname=provinceCode]', province.code);
  await page.click('Lưu thay đổi');
  await page.wait(`document.body.textContent.includes('Đã cập nhật hồ sơ')`, 'profile save');
  passed('New login reopens missing fields; province action focuses field and saves via User API');

  await navigate('/account/contacts?kind=email', `!!document.querySelector('input[type=email]')`);
  const email = `${owner.id}@example.test`;
  await page.fill('input[type=email]', email);
  await page.click('Gửi mã xác minh');
  await page.wait(
    `!!document.querySelector('input[autocomplete=one-time-code]')`,
    'email challenge',
  );
  const code = fixture.email.lastCode(email);
  assert.ok(code);
  await page.fill('input[autocomplete=one-time-code]', code);
  await page.fill('input[type=password]', 'Fixture passphrase 928!');
  await page.click('Xác minh & lưu');
  await page.wait(
    `document.body.textContent.includes('Đã xác minh và cập nhật thông tin liên hệ')`,
    'email verified',
  );
  await page.click('Đăng xuất');
  await page.wait(`location.pathname === '/auth/login'`, 'logout after update');
  await login();
  await page.wait(
    `document.querySelectorAll('app-reminder-card li').length === 1`,
    'recalculated missing phone',
  );
  assert.equal(
    await page.evaluate(`!!document.querySelector('app-reminder-card a[href*="kind=phone"]')`),
    true,
  );
  await page.click('Để sau');
  await navigate(
    '/account',
    `!!document.querySelector('app-avatar') && !document.querySelector('app-reminder-card .status')`,
  );
  assert.equal(await page.evaluate(`!!document.querySelector('app-reminder-card aside')`), false);
  passed(
    'Real email OTP/re-auth removes email reminder; completed province stays absent; later survives reload',
  );

  const completed = await fixture.user({
    email: `complete-${owner.id}@example.test`,
    verified: true,
  });
  await fixture.db.user.update({ where: { id: completed.id }, data: { provinceId: province.id } });
  await page.click('Đăng xuất');
  await page.wait(`location.pathname === '/auth/login'`, 'account switch');
  await login(completed);
  await page.wait(
    `!document.querySelector('app-reminder-card .status') && document.body.textContent.includes(${JSON.stringify(completed.username)})`,
    'complete account',
  );
  assert.equal(await page.evaluate(`!!document.querySelector('app-reminder-card aside')`), false);
  assert.equal(
    await fixture.db.notification.count({
      where: { recipientId: { in: [owner.id, completed.id] } },
    }),
    0,
  );
  passed(
    'Account switch to a complete profile shows no stale reminder and creates no Notification',
  );
};
