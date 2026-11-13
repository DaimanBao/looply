const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');
const { randomBytes, randomInt } = require('node:crypto');
const { BrowserPage } = require('./cdp.cjs');
const root = path.resolve(__dirname, '../..');
const backend = path.join(root, 'backend');
const dotenv = require(path.join(backend, 'node_modules/dotenv'));
const { Client } = require(path.join(backend, 'node_modules/pg'));
const children = [];
const report = [];
let page;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'looply-frontend-e2e-'));
const artifacts = path.join(root, 'frontend/tmp/e2e');
fs.mkdirSync(artifacts, { recursive: true });

/** Starts an isolated child without printing its environment, credentials or request bodies. */
function start(command, args, options) {
  const child = spawn(command, args, { ...options, windowsHide: true, stdio: 'ignore' });
  children.push(child);
  return child;
}
/** Waits for an HTTP listener with a bounded deadline. */
async function ready(url, timeout = 60000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Development listener did not become ready');
}
/** Reports only named checks, never tokens, OTPs, credentials or contact values. */
function passed(name) {
  report.push(name);
  console.log(`PASS ${name}`);
}

/** Exercises Angular forms against actual isolated PostgreSQL/Redis and fake delivery only. */
async function main() {
  const env = { ...process.env, ...dotenv.parse(fs.readFileSync(path.join(backend, '.env'))) };
  const target = new URL(env.TEST_DATABASE_URL);
  if (
    env.NODE_ENV === 'production' ||
    target.pathname !== '/looply_test' ||
    target.searchParams.has('database') ||
    target.searchParams.has('dbname') ||
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  )
    throw new Error('E2E requires local isolated looply_test');
  const database = new Client({ connectionString: env.TEST_DATABASE_URL });
  await database.connect();
  try {
    assert.equal(
      (await database.query('SELECT current_database() AS name')).rows[0].name,
      'looply_test',
    );
  } finally {
    await database.end();
  }
  // Uses ephemeral keys for this run, with no edits to .env and no migrations/seed/cleanup on development.
  const inspectorKey = randomBytes(48).toString('base64url');
  Object.assign(env, {
    NODE_ENV: 'development',
    DATABASE_URL: env.TEST_DATABASE_URL,
    HOST: '127.0.0.1',
    PORT: '3000',
    LOG_LEVEL: 'silent',
    AUTH_JWT_SECRET: randomBytes(48).toString('base64url'),
    AUTH_OTP_PEPPER: randomBytes(48).toString('base64url'),
    GOOGLE_CLIENT_ID: 'development-disabled',
    AUTH_ALLOWED_ORIGINS: 'http://localhost:4200',
    CORS_ORIGINS: 'http://localhost:4200',
    CORS_CREDENTIALS: 'true',
    REDIS_URL: env.TEST_REDIS_URL || 'redis://127.0.0.1:6380/15',
    SMS_PROVIDER: 'fake',
    EMAIL_PROVIDER: 'fake',
    MEDIA_PROVIDER: 'local',
    DEV_OTP_INSPECTOR_ENABLED: 'true',
    DEV_OTP_INSPECTOR_KEY: inspectorKey,
    DEV_OTP_INSPECTOR_PORT: '3101',
  });
  const redisTarget = new URL(env.REDIS_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(redisTarget.hostname));
  assert.match(redisTarget.pathname, /^\/[1-9][0-9]*$/);
  for (const port of [3000, 3101, 4200, 9229]) {
    const net = require('node:net');
    await new Promise((resolve, reject) => {
      const listener = net.createServer();
      listener.once('error', () => reject(new Error(`E2E port ${port} already in use`)));
      listener.listen(port, '127.0.0.1', () => listener.close(resolve));
    });
  }
  start(process.execPath, ['--require', 'tsx/cjs', '../frontend/e2e/backend.cjs'], {
    cwd: backend,
    env,
  });
  start(
    process.execPath,
    ['node_modules/@angular/cli/bin/ng.js', 'serve', '--host', 'localhost', '--port', '4200'],
    { cwd: path.join(root, 'frontend'), env: process.env },
  );
  await Promise.all([ready('http://127.0.0.1:3000/api/health'), ready('http://localhost:4200')]);
  passed('Verified looply_test PostgreSQL, isolated Redis and real API startup');
  const browser =
    process.env.CHROMIUM_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (!fs.existsSync(browser))
    throw new Error('Set CHROMIUM_PATH to an installed Chromium browser');
  start(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=9229',
      `--user-data-dir=${temporary}`,
      'about:blank',
    ],
    { env: process.env },
  );
  await ready('http://127.0.0.1:9229/json/version');
  const tabs = await (await fetch('http://127.0.0.1:9229/json')).json();
  page = await BrowserPage.connect(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl);
  let lastOtp;
  const requests = new Map();
  page.listeners.push((message) => {
    if (message.method === 'Network.responseReceived')
      requests.set(message.params.requestId, message.params.response.url);
    if (
      message.method === 'Network.loadingFinished' &&
      requests.get(message.params.requestId)?.endsWith('/api/auth/otp/request')
    )
      void page
        .send('Network.getResponseBody', { requestId: message.params.requestId })
        .then((result) => {
          const payload = JSON.parse(result.body);
          if (payload.challengeId) lastOtp = payload;
        })
        .catch(() => {});
  });
  /** Reads a single delivered code through the separate authenticated loopback tool. */
  async function inspect(challengeId, destination) {
    const code = execFileSync(
      process.execPath,
      ['scripts/inspect-otp.cjs', challengeId, destination],
      {
        cwd: backend,
        env: { ...env, DEV_OTP_INSPECTOR_KEY: inspectorKey },
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
    assert.ok(/^[0-9]{6}$/.test(code), 'CLI must return a live delivered code');
    return code;
  }
  /** Completes the visible OTP control without bypassing challenge verification. */
  async function otp(destination) {
    lastOtp = undefined;
    await page.click('Gửi mã xác minh');
    const until = Date.now() + 10000;
    while (!lastOtp && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(lastOtp, 'OTP metadata not received');
    const code = await inspect(lastOtp.challengeId, destination);
    await page.fill('app-otp-input input', code);
    return code;
  }
  /** Creates isolated fixture setup through the same API, without direct credential/database inserts. */
  async function api(pathname, { method = 'GET', body, token } = {}) {
    const response = await fetch(`http://127.0.0.1:3000/api${pathname}`, {
      method,
      headers: {
        Origin: 'http://localhost:4200',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.ok(
      response.ok,
      `Fixture API ${method} ${pathname.split('/').slice(0, 3).join('/')} status ${response.status}`,
    );
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }
  const username = `ui_${randomBytes(7).toString('hex')}`;
  const password = `Looply ${randomBytes(20).toString('base64url')}!`;
  const phone = `+849${randomInt(10000000, 100000000)}`;
  const email = `looply_${randomBytes(6).toString('hex')}@example.com`;
  await page.navigate(
    '/account',
    `location.pathname==='/auth/login' && !!document.querySelector('input[formcontrolname="username"]')`,
  );
  passed('Guest route guard');
  await page.navigate('/auth/register', `document.querySelectorAll('select option').length>=35`);
  await page.fill('[formcontrolname="username"]', username);
  await page.fill('[formcontrolname="password"]', password);
  await page.fill('[formcontrolname="phone"]', phone);
  await page.fill('select', '01');
  const registrationCode = await otp(phone);
  const wrongCode = `${(Number(registrationCode[0]) + 1) % 10}${registrationCode.slice(1)}`;
  await page.fill('app-otp-input input', wrongCode);
  await page.click('Tạo tài khoản');
  await page.wait(`!!document.querySelector('.error')`, 'reject wrong OTP');
  assert.equal(await page.evaluate(`location.pathname==='/auth/register'`), true);
  passed('Wrong OTP cannot register or bypass verification');
  await page.fill('app-otp-input input', registrationCode);
  await page.click('Tạo tài khoản');
  await page.wait(
    `location.pathname==='/account' && document.body.textContent.includes(${JSON.stringify(username)})`,
    'registration / password screen',
    30000,
  );
  passed('SMS OTP registration, live province catalog and automatic login');
  assert.equal(await page.evaluate('localStorage.length + sessionStorage.length'), 0);
  passed('No token in browser storage');
  const cookies = await page.send('Network.getCookies', {
    urls: ['http://localhost:4200/api/auth/refresh'],
  });
  const refresh = cookies.cookies.find((cookie) => cookie.name === 'looply_refresh');
  assert.ok(refresh?.httpOnly);
  assert.equal(refresh.sameSite, 'Strict');
  assert.equal(refresh.path, '/api/auth');
  passed('HttpOnly SameSite Strict refresh cookie');
  await page.navigate('/account', `!!document.querySelector('.profile-hero')`);
  passed('Reload restores session through real cookie rotation');
  await page.evaluate(
    `(()=>{const original=Date.now;Date.now=()=>original()+900000;document.querySelector('a[href="/account/sessions"]').click()})()`,
  );
  await page.wait(
    `location.pathname==='/account/sessions' && !!document.querySelector('.list-row')`,
    'refresh before expired request',
  );
  passed('RAM token expiry triggers real refresh without losing the session');
  await page.navigate('/account', `!!document.querySelector('.profile-hero')`);
  const ownerId = await page.evaluate(
    `document.querySelector('a[href$="/followers"]').getAttribute('href').split('/')[2]`,
  );
  await page.navigate(
    '/account/edit',
    `!!document.querySelector('[formcontrolname="displayName"]')`,
  );
  await page.fill('[formcontrolname="displayName"]', 'Thành viên kiểm thử Angular');
  await page.fill('textarea', 'Kết nối từ những món đồ quen thuộc.');
  await page.click('Lưu thay đổi');
  await page.wait(`document.body.textContent.includes('Đã cập nhật hồ sơ.')`, 'profile update');
  passed('Edit display name, biography and province');
  const png = await require(path.join(backend, 'node_modules/sharp'))({
    create: { width: 32, height: 32, channels: 3, background: '#226649' },
  })
    .png()
    .toBuffer();
  const avatarPath = path.join(temporary, 'avatar.png');
  fs.writeFileSync(avatarPath, png);
  const document = await page.send('DOM.getDocument');
  const file = await page.send('DOM.querySelector', {
    nodeId: document.root.nodeId,
    selector: 'input[type=file]',
  });
  await page.send('DOM.setFileInputFiles', { nodeId: file.nodeId, files: [avatarPath] });
  await page.wait(
    `document.body.textContent.includes('Đã thay ảnh đại diện.') && !!document.querySelector('app-avatar img')`,
    'avatar upload',
  );
  await page.click('Xóa ảnh đại diện');
  await page.wait(`document.body.textContent.includes('Đã xóa ảnh đại diện.')`, 'avatar removal');
  passed('Local avatar raw-byte upload, protected rendering and removal');
  await page.navigate('/account/contacts', `!!document.querySelector('app-reauth-input')`);
  await page.fill('input[type=email]', email);
  await otp(email);
  await page.fill('app-reauth-input input[type=password]', password);
  await page.click('Xác minh & lưu');
  await page.wait(
    `document.body.textContent.includes('Đã xác minh và cập nhật thông tin liên hệ.')`,
    'verified email',
  );
  passed('Verify email with OTP and password re-authentication');
  const newPhone = `+849${randomInt(10000000, 100000000)}`;
  // A new control instance separates resend cooldown state for two different contacts.
  await page.navigate('/account/contacts', `!!document.querySelector('app-reauth-input')`);
  await page.click('Số điện thoại');
  await page.fill('input[type=tel]', newPhone);
  await otp(newPhone);
  const phoneIssuedAt = Date.now();
  await page.fill('app-reauth-input input[type=password]', password);
  await page.click('Xác minh & lưu');
  await page.wait(
    `document.body.textContent.includes('Đã xác minh và cập nhật thông tin liên hệ.')`,
    'phone change',
  );
  passed('Change verified phone through a new-contact OTP and re-authentication');
  const otherPhone = `+849${randomInt(10000000, 100000000)}`;
  const otherUsername = `ui_${randomBytes(7).toString('hex')}`;
  const challenge = await api('/auth/otp/request', {
    method: 'POST',
    body: { purpose: 'REGISTER_PHONE', destination: otherPhone },
  });
  const otherSession = await api('/auth/register', {
    method: 'POST',
    body: {
      username: otherUsername,
      password,
      phone: otherPhone,
      provinceCode: '01',
      challengeId: challenge.challengeId,
      code: await inspect(challenge.challengeId, otherPhone),
    },
  });
  const other = await api('/users/me', { token: otherSession.accessToken });
  await page.navigate(
    `/users/${other.id}`,
    `document.body.textContent.includes(${JSON.stringify(otherUsername)})`,
  );
  await page.click('Theo dõi');
  await page.wait(`document.body.textContent.includes('Đã theo dõi.')`, 'follow');
  await page.navigate(
    `/users/${ownerId}/following`,
    `document.body.textContent.includes(${JSON.stringify(otherUsername)})`,
  );
  passed('Public profile, Follow and following list');
  await page.navigate(
    `/users/${other.id}`,
    `document.body.textContent.includes(${JSON.stringify(otherUsername)})`,
  );
  await page.click('Bỏ theo dõi');
  assert.equal(
    await page.evaluate(`document.body.textContent.includes('Bạn có chắc muốn bỏ theo dõi')`),
    true,
  );
  await page.click('Xác nhận');
  await page.wait(`document.body.textContent.includes('Đã bỏ theo dõi.')`, 'unfollow');
  passed('Explicit Unfollow confirmation');
  await page.click('Theo dõi');
  await page.wait(`document.body.textContent.includes('Đã theo dõi.')`, 'follow before block');
  await page.click('Chặn tài khoản');
  await page.click('Xác nhận');
  await page.wait(`document.body.textContent.includes('Đã chặn tài khoản.')`, 'block');
  await page.navigate('/account/blocked', `!!document.querySelector('.list-row')`);
  await page.click('Bỏ chặn');
  await page.click('Xác nhận bỏ chặn');
  await page.wait(`document.body.textContent.includes('Đã bỏ chặn.')`, 'unblock');
  await page.navigate(
    `/users/${ownerId}/following`,
    `document.body.textContent.includes('Chưa có tài khoản nào')`,
  );
  passed('Block hides profile/removes Follow; Unblock does not restore Follow');
  await page.navigate('/account/username', `!!document.querySelector('input')`);
  const renamed = username + '_new';
  await page.fill('input', renamed);
  await page.click('Lưu tên đăng nhập');
  await page.wait(`document.body.textContent.includes('Đã đổi tên đăng nhập.')`, 'username update');
  await page.fill('input', username);
  await page.click('Lưu tên đăng nhập');
  await page.wait(`!!document.querySelector('.error')`, 'cooldown rejection');
  passed('Username change and server-enforced cooldown');
  await api('/auth/login/password', { method: 'POST', body: { username: renamed, password } });
  await page.navigate('/account/sessions', `document.querySelectorAll('.list-row').length>=2`);
  passed('Own session metadata');
  await page.evaluate(
    `(()=>{const row=[...document.querySelectorAll('.list-row')].find(e=>e.textContent.includes('Phiên đăng nhập khác'));row.querySelector('button').click()})()`,
  );
  await page.click('Xác nhận thu hồi');
  await page.wait(`document.querySelectorAll('.list-row').length===1`, 'revoke other session');
  passed('Revoke another real session');
  const changedPassword = `Looply ${randomBytes(20).toString('base64url')}!`;
  await page.navigate('/account/password', `!!document.querySelector('app-reauth-input')`);
  await page.fill('form > label input', changedPassword);
  // Honor the real destination cooldown; no Redis counter or server clock changes.
  while (Date.now() - phoneIssuedAt < 61000)
    await new Promise((resolve) => setTimeout(resolve, 500));
  await page.click('OTP số đã xác minh');
  await otp(newPhone);
  const reauthPhoneIssuedAt = Date.now();
  await page.click('Đổi mật khẩu');
  await page.wait(`document.body.textContent.includes('Đã đổi mật khẩu')`, 'password change');
  passed('Change password with verified-phone OTP re-authentication and fresh operation proof');
  await page.navigate('/account/deletion', `!!document.querySelector('app-reauth-input')`);
  await page.fill('app-reauth-input input[type=password]', changedPassword);
  await page.evaluate(`(()=>{const c=document.querySelector('input[type=checkbox]');c.click()})()`);
  await page.click('Yêu cầu xóa tài khoản');
  await page.wait(`location.pathname==='/auth/login'`, 'deletion revocation');
  await page.wait(`!!document.querySelector('[formcontrolname=username]')`, 'login form');
  await page.fill('[formcontrolname=username]', renamed);
  await page.fill('[formcontrolname=password]', changedPassword);
  await page.click('Đăng nhập');
  await page.wait(
    `location.pathname==='/account/deletion' && document.body.textContent.includes('Tài khoản đang chờ xóa')`,
    'pending login',
  );
  await page.navigate(
    '/account/edit',
    `location.pathname==='/account/deletion' && document.body.textContent.includes('Tài khoản đang chờ xóa')`,
  );
  assert.equal(await page.evaluate(`!!document.querySelector('app-reauth-input')`), false);
  passed('Deletion request, revoked session, pending login and restricted routes');
  await page.evaluate(`document.querySelector('input[type=checkbox]').click()`);
  await page.click('Xác nhận hủy yêu cầu xóa');
  await page.wait(
    `location.pathname==='/account' && !!document.querySelector('.profile-hero')`,
    'explicit cancellation',
  );
  passed('Explicit account deletion cancellation');
  for (const width of [1440, 390]) {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(
      path.join(artifacts, `account-${width}.png`),
      Buffer.from(screenshot.data, 'base64'),
    );
  }
  passed('Desktop and mobile layout without horizontal overflow');
  await page.click('Đăng xuất');
  await page.wait(`location.pathname==='/auth/login'`, 'logout');
  await page.navigate('/account', `location.pathname==='/auth/login'`);
  passed('Logout revokes cookie authority and protects reload');
  // Honor real Redis cooldowns; neither browser clocks nor Redis counters are modified.
  while (Date.now() - reauthPhoneIssuedAt < 61000)
    await new Promise((resolve) => setTimeout(resolve, 500));
  await page.wait(`!!document.querySelector('[formcontrolname=username]')`, 'phone login page');
  await page.click('Số điện thoại');
  await page.fill('input[type=tel]', newPhone);
  await otp(newPhone);
  await page.click('Đăng nhập');
  await page.wait(
    `location.pathname==='/account' && !!document.querySelector('.profile-hero')`,
    'phone OTP login',
  );
  passed('Phone OTP login using real Redis limits');
  await page.click('Đăng xuất');
  await page.wait(`location.pathname==='/auth/login'`, 'logout before reset');
  const recoveredPassword = `Looply ${randomBytes(20).toString('base64url')}!`;
  await page.navigate('/auth/reset', `!!document.querySelector('[formcontrolname=destination]')`);
  await page.fill('[formcontrolname=destination]', email);
  await otp(email);
  await page.fill('[formcontrolname=password]', recoveredPassword);
  await page.click('Đặt mật khẩu mới');
  await page.wait(`document.body.textContent.includes('Đã đổi mật khẩu.')`, 'password recovery');
  await page.navigate('/auth/login', `!!document.querySelector('[formcontrolname=username]')`);
  await page.fill('[formcontrolname=username]', renamed);
  await page.fill('[formcontrolname=password]', recoveredPassword);
  await page.click('Đăng nhập');
  await page.wait(
    `location.pathname==='/account' && !!document.querySelector('.profile-hero')`,
    'login after reset',
  );
  passed('Email OTP recovery and login with new password');
  const targetInfo = await page.send('Target.createTarget', {
    url: 'http://localhost:4200/account',
  });
  const openTabs = await (await fetch('http://127.0.0.1:9229/json')).json();
  const second = await BrowserPage.connect(
    openTabs.find((tab) => tab.id === targetInfo.targetId).webSocketDebuggerUrl,
  );
  await second.wait(`!!document.querySelector('.profile-hero')`, 'second-tab restoration');
  await page.click('Đăng xuất');
  await page.wait(`location.pathname==='/auth/login'`, 'final logout');
  await second.evaluate(`document.querySelector('a[href="/account/sessions"]').click()`);
  await second.wait(`location.pathname==='/auth/login'`, 'other-tab revocation');
  assert.equal(await second.evaluate(`!!document.querySelector('.profile-hero')`), false);
  passed('Other-tab logout revokes the server session and clears stale client authority');
  second.close();
  fs.writeFileSync(
    path.join(artifacts, 'report.json'),
    JSON.stringify(
      {
        checks: report,
        database: 'looply_test',
        fixtureUsername: renamed,
        note: 'Owned E2E accounts retained on looply_test; no development writes or migrations.',
      },
      null,
      2,
    ),
  );
}

main()
  .catch(async (error) => {
    console.error(`FAIL ${error.message}`);
    if (page) {
      console.error(
        'Visible feedback:',
        await page.evaluate(
          `[...document.querySelectorAll('.error')].map(e=>e.textContent).join(' ')`,
        ),
      );
      const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(artifacts, 'failure.png'), Buffer.from(screenshot.data, 'base64'));
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    if (page) {
      try {
        await page.send('Network.clearBrowserCookies');
        await page.send('Browser.close');
      } catch {}
      page.close();
    }
    for (const child of children.reverse()) child.kill();
    // Temporary browser files are left in the OS temp directory; never recursively delete a computed path here.
  });
