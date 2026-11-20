const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { BrowserPage } = require('./cdp.cjs');
const root = path.resolve(__dirname, '../..');
const backend = path.join(root, 'backend');
const dotenv = require(path.join(backend, 'node_modules/dotenv'));
Object.assign(process.env, dotenv.parse(fs.readFileSync(path.join(backend, '.env'))));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'looply-listing-e2e-'));
const artifacts = path.join(root, 'frontend/tmp/listing-e2e');
fs.mkdirSync(artifacts, { recursive: true });
const children = [];
const apiPort = Number(process.env.LOOPLY_E2E_API_PORT || '3000');
const uiPort = Number(process.env.LOOPLY_E2E_UI_PORT || '4200');
const checks = [];
let fixture;
let listener;
let page;
let chatRealtime;

/** Chỉ khởi động tiến trình thuộc test, ẩn cửa sổ helper Windows và giữ kín credential. */
function start(command, args, options) {
  const child = spawn(command, args, { ...options, windowsHide: true, stdio: 'ignore' });
  children.push(child);
  return child;
}
/** Chờ listener test mà không để tiến trình chạy vô thời hạn. */
async function ready(url) {
  const until = Date.now() + 60000;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* Listener vẫn đang khởi động. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Test listener timed out');
}
/** Chỉ ghi bằng chứng an toàn; không in token/mật khẩu/liên hệ fixture. */
function passed(name) {
  checks.push(name);
  console.log(`PASS ${name}`);
}

/** Kiểm tra khám phá Angular công khai và giải mã trình duyệt với adapter API/database/media thật. */
async function main() {
  assert.ok(
    [apiPort, uiPort].every((port) => Number.isInteger(port) && port >= 1024 && port <= 65535),
  );
  const target = new URL(process.env.TEST_DATABASE_URL);
  assert.equal(target.pathname, '/looply_test');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  assert.equal(target.searchParams.has('database') || target.searchParams.has('dbname'), false);
  const redis = new URL(process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6380/15');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(redis.hostname));
  assert.match(redis.pathname, /^\/[1-9][0-9]*$/);
  process.env.TEST_REDIS_URL = redis.href;
  process.env.MEDIA_STAGING_DIRECTORY = path.join(directory, 'staging');
  for (const port of [apiPort, uiPort, 9230, ...(process.argv.includes('--chat') ? [9231] : [])]) {
    await new Promise((resolve, reject) => {
      const server = require('node:net').createServer();
      server.once('error', () => reject(new Error(`Test port ${port} is in use`)));
      server.listen(port, '127.0.0.1', () => server.close(resolve));
    });
  }
  process.chdir(backend);
  const { createAuthFixture } = require(path.join(backend, 'tests/helpers/auth-fixture.ts'));
  const { LocalObjectStore } = require(path.join(backend, 'src/modules/media/object-store.ts'));
  // Fixture chung xác minh SELECT current_database() trước mọi ghi và sở hữu mọi ID cleanup.
  fixture = await createAuthFixture(new LocalObjectStore(path.join(directory, 'objects')));
  fixture.config.origins.push(`http://localhost:${uiPort}`);
  const request = require(path.join(backend, 'node_modules/supertest'));
  const sharp = require(path.join(backend, 'node_modules/sharp'));
  const owner = await fixture.user();
  const token = (await fixture.db.$transaction((tx) => fixture.sessions.create(owner, tx)))
    .accessToken;
  const province = await fixture.province();
  const marker = `Discovery ${randomUUID().slice(0, 8)}`;
  const image = await sharp({
    create: { width: 480, height: 360, channels: 3, background: '#226649' },
  })
    .png()
    .toBuffer();
  /** Upload byte tổng hợp qua validation và storage thông thường, giữ credential trong tiến trình này. */
  async function upload(bytes) {
    const result = await request(fixture.app)
      .post('/api/media/listing-uploads')
      .auth(token, { type: 'bearer' })
      .set('Content-Type', 'application/octet-stream')
      .send(bytes);
    assert.equal(result.status, 201, 'Fixture upload failed');
    return result.body.id;
  }
  const videoId =
    process.argv.includes('--management') ||
    process.argv.includes('--follow') ||
    process.argv.includes('--chat')
      ? null
      : await upload(fs.readFileSync(path.join(backend, 'tests/fixtures/video/valid.mp4')));
  const listings = [];
  for (
    let index = 0;
    index <
    (process.argv.includes('--management')
      ? 0
      : process.argv.includes('--follow') || process.argv.includes('--chat')
        ? 1
        : 14);
    index++
  ) {
    const imageId = await upload(image);
    const result = await request(fixture.app)
      .post('/api/listings')
      .auth(token, { type: 'bearer' })
      .send({
        title: `${marker} Đèn học ${index}`,
        description: 'Món đồ thử nghiệm công khai với ảnh và mô tả đầy đủ.',
        type: 'SALE',
        price: String(100000 + index),
        rentalUnit: null,
        provinceCode: province.code,
        media: { imageIds: [imageId], videoId: index === 0 ? videoId : null },
      });
    assert.equal(result.status, 201, 'Fixture listing failed');
    listings.push(result.body);
  }
  listener = fixture.app.listen(apiPort, '127.0.0.1');
  if (process.argv.includes('--chat')) {
    const { attachChatRealtime } = require(path.join(backend, 'src/modules/chat/index.ts'));
    chatRealtime = attachChatRealtime(
      listener,
      fixture.chat,
      fixture.sessions,
      fixture.config.origins,
      fixture.notifications,
    );
  }
  const proxyPath = path.join(directory, 'proxy.json');
  const proxy = JSON.parse(fs.readFileSync(path.join(root, 'frontend/proxy.conf.json'), 'utf8'));
  for (const value of Object.values(proxy)) value.target = `http://127.0.0.1:${apiPort}`;
  fs.writeFileSync(proxyPath, JSON.stringify(proxy));
  start(
    process.execPath,
    [
      path.join(root, 'frontend/node_modules/@angular/cli/bin/ng.js'),
      'serve',
      '--host',
      'localhost',
      '--port',
      String(uiPort),
      '--proxy-config',
      proxyPath,
    ],
    { cwd: path.join(root, 'frontend'), env: process.env },
  );
  await ready(`http://localhost:${uiPort}`);
  const browser =
    process.env.CHROMIUM_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  assert.ok(fs.existsSync(browser), 'CHROMIUM_PATH must reference installed Chrome');
  start(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--autoplay-policy=no-user-gesture-required',
      '--remote-debugging-port=9230',
      `--user-data-dir=${path.join(directory, 'chrome')}`,
      'about:blank',
    ],
    {},
  );
  await ready('http://127.0.0.1:9230/json/version');
  const tabs = await (await fetch('http://127.0.0.1:9230/json')).json();
  page = await BrowserPage.connect(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl);
  if (process.argv.includes('--chat')) {
    await require(process.argv.includes('--notifications') ? './notification.cjs' : './chat.cjs')({
      page,
      fixture,
      owner,
      listing: listings[0],
      passed,
      start,
      ready,
      directory,
      artifacts,
      browser,
      image,
      chatRealtime,
    });
    fs.writeFileSync(
      path.join(
        artifacts,
        process.argv.includes('--notifications') ? 'notification-report.json' : 'chat-report.json',
      ),
      JSON.stringify({ database: 'looply_test', checks }, null, 2),
    );
    return;
  }
  if (process.argv.includes('--follow')) {
    await require('./listing-follow.cjs')({ page, fixture, owner, listing: listings[0], passed });
    fs.writeFileSync(
      path.join(artifacts, 'follow-report.json'),
      JSON.stringify({ database: 'looply_test', checks }, null, 2),
    );
    return;
  }
  if (process.argv.includes('--management')) {
    await require('./listing-management.cjs')({
      page,
      owner,
      province,
      fixture,
      artifacts,
      directory,
      image,
      backend,
      passed,
    });
    fs.writeFileSync(
      path.join(artifacts, 'management-report.json'),
      JSON.stringify({ database: 'looply_test', checks }, null, 2),
    );
    return;
  }
  await page.navigate('/', `!!document.querySelector('input[type=search]')`);
  assert.equal(
    await page.evaluate(`(async()=>{
    const url='/api/listings?feed=national&sort=RANDOM&limit=12';
    const first=await (await fetch(url)).json();
    if(!first.pagination.nextCursor)return false;
    const next=url+'&after='+encodeURIComponent(first.pagination.nextCursor);
    const second=await (await fetch(next)).json();
    const repeated=await (await fetch(next)).json();
    return JSON.stringify(second.data.map(row=>row.id))===JSON.stringify(repeated.data.map(row=>row.id)) &&
      !second.data.some(row=>first.data.some(previous=>previous.id===row.id));
  })()`),
    true,
  );
  passed('National seed-bound cursor preserves repeatable order across pages');
  await page.fill('input[type=search]', marker);
  await page.wait(
    `document.querySelectorAll('app-listing-card').length >= 12`,
    'first discovery page',
  );
  passed('Guest discovery, real API title search and first page of 12');
  await page.evaluate(`window.scrollTo(0,document.body.scrollHeight)`);
  await page.wait(
    `document.querySelectorAll('app-listing-card').length === 14`,
    'infinite scroll continuation',
  );
  assert.equal(
    await page.evaluate(
      `new Set([...document.querySelectorAll('app-listing-card h2 a')].map(a=>a.href)).size`,
    ),
    14,
  );
  passed('Real cursor continuation, infinite scroll and ID deduplication');
  for (const width of [1440, 390]) {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
    await page.evaluate('window.scrollTo(0,0)');
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(
      path.join(artifacts, `feed-${width}.png`),
      Buffer.from(screenshot.data, 'base64'),
    );
  }
  passed('Discovery responsive layout at 1440 and 390 pixels');
  await page.fill('input[type=search]', `${marker} den hoc 0`);
  await page.wait(
    `document.querySelectorAll('app-listing-card').length === 1 && !!document.querySelector('.suggestions a')`,
    'accent folded title and suggestions',
  );
  passed('Vietnamese accent-free Backend search and suggestions');
  await page.click('Nearby · Gần bạn');
  await page.wait(
    `!!document.querySelector('select[formcontrolname=provinceCode]')`,
    'Nearby selection',
  );
  await page.fill('select[formcontrolname=provinceCode]', province.code);
  await page.wait(
    `document.querySelectorAll('app-listing-card').length === 1`,
    'Nearby selected province',
  );
  await page.fill('select[formcontrolname=type]', 'RENT');
  await page.wait(`!!document.querySelector('select[formcontrolname=rentalUnit]')`, 'rental unit');
  assert.equal(
    await page.evaluate(`!!document.querySelector('input[formcontrolname=minPrice]')`),
    false,
  );
  await page.fill('select[formcontrolname=rentalUnit]', 'DAY');
  await page.wait(
    `!!document.querySelector('input[formcontrolname=minPrice]')`,
    'comparable rental prices',
  );
  passed('Explicit province and RENT DAY price controls');
  await page.navigate(
    `/listings/${listings[0].id}`,
    `!!document.querySelector('.detail-content h1')`,
  );
  await page.wait(
    `document.querySelector('app-listing-gallery img')?.naturalWidth > 0`,
    'authorized image bytes',
  );
  await page.evaluate(
    `[...document.querySelectorAll('app-listing-gallery button')].find(b=>b.textContent.includes('Video')).click()`,
  );
  await page.wait(
    `document.querySelector('video')?.readyState >= 2`,
    'native video metadata and frames',
  );
  await page.evaluate(`document.querySelector('video').play()`);
  await page.wait(`document.querySelector('video').currentTime > 0`, 'native video playback');
  passed('Guest detail, real media delivery, gallery switch and native MP4 playback');
  for (const width of [1440, 390]) {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(
      path.join(artifacts, `detail-${width}.png`),
      Buffer.from(screenshot.data, 'base64'),
    );
  }
  passed('Detail responsive layout at 1440 and 390 pixels');
  const hidden = await request(fixture.app)
    .patch(`/api/listings/${listings[0].id}/visibility`)
    .auth(token, { type: 'bearer' })
    .send({ status: 'HIDDEN', expectedVersion: listings[0].version });
  assert.equal(hidden.status, 200);
  await page.navigate(
    `/listings/${listings[0].id}`,
    `document.body.textContent.includes('Bài đăng không khả dụng')`,
  );
  assert.equal(
    await page.evaluate(
      `!!document.querySelector('video') || !!document.querySelector('.detail-content')`,
    ),
    false,
  );
  const deleted = await request(fixture.app)
    .delete(`/api/listings/${listings[1].id}`)
    .auth(token, { type: 'bearer' })
    .send({ expectedVersion: listings[1].version, confirmDelete: true });
  assert.equal(deleted.status, 204);
  await page.navigate(
    `/listings/${listings[1].id}`,
    `document.body.textContent.includes('Bài đăng không khả dụng')`,
  );
  passed('Hidden and deleted listings denied to guest by real API');
  fs.writeFileSync(
    path.join(artifacts, 'report.json'),
    JSON.stringify({ database: 'looply_test', checks }, null, 2),
  );
}

main()
  .catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (page) {
      try {
        await page.send('Browser.close');
      } catch {
        /* Trình duyệt có thể đã thoát. */
      }
      page.close();
    }
    for (const child of children.reverse()) child.kill();
    if (chatRealtime) chatRealtime.stop();
    if (listener) {
      listener.closeAllConnections();
      await new Promise((resolve) => listener.close(resolve));
    }
    if (fixture) await fixture.dispose();
    // Thư mục tạm hệ điều hành chỉ chứa media tổng hợp và hồ sơ trình duyệt tạm; không xóa đệ quy bằng shell.
  });
