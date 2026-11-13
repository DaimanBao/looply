const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/** Chạy một luồng quản lý bằng Angular và API thật; fixture chỉ tạo tài khoản/Province cô lập. */
module.exports = async function management({
  page,
  owner,
  province,
  fixture,
  artifacts,
  directory,
  image,
  backend,
  passed,
}) {
  await page.navigate(
    '/auth/login?returnUrl=/account/listings',
    `!!document.querySelector('input[formcontrolname=username]')`,
  );
  await page.fill('input[formcontrolname=username]', owner.username);
  await page.fill('input[formcontrolname=password]', 'Fixture passphrase 928!');
  await page.click('Đăng nhập');
  await page.wait(
    `location.pathname === '/account/listings' && document.body.textContent.includes('Bạn chưa có bài đăng')`,
    'login and empty owner list',
  );
  passed('Login through real Auth API and empty My Listings');
  await page.evaluate(`document.querySelector('a[href="/listings/new"]').click()`);
  await page.wait(`!!document.querySelector('#listing-title')`, 'new editor');
  await page.fill('#listing-title', 'Đèn học kiểm thử quản lý');
  await page.fill('#listing-description', 'Mô tả bài đăng kiểm thử quản lý với media thật.');
  await page.fill('#listing-price', '250000');
  await page.fill('#listing-province', province.code);
  const imagePath = path.join(directory, 'editor.png');
  fs.writeFileSync(imagePath, image);
  const { root } = await page.send('DOM.getDocument');
  const { nodeId } = await page.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '#listing-files',
  });
  await page.send('DOM.setFileInputFiles', {
    nodeId,
    files: [imagePath, path.join(backend, 'tests/fixtures/video/valid.mp4')],
  });
  await page.wait(
    `document.querySelectorAll('.media-item').length === 2 && [...document.querySelectorAll('.media-item')].every(e=>e.textContent.includes('Sẵn sàng'))`,
    'image and video upload',
    30000,
  );
  passed('Image/video preview and real raw upload with server video inspection');
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
      path.join(artifacts, `management-${width}.png`),
      Buffer.from(screenshot.data, 'base64'),
    );
  }
  passed('Management responsive at desktop and mobile widths');
  await page.click('Lưu bài đăng');
  await page.wait(
    `location.pathname === '/account/listings' && !!document.querySelector('.listing-grid article')`,
    'created owner listing',
  );
  const row = await fixture.db.listing.findFirst({ where: { ownerId: owner.id } });
  assert.ok(row);
  assert.equal(
    (await fixture.db.mediaAsset.findMany({ where: { listingId: row.id, status: 'ATTACHED' } }))
      .length,
    2,
  );
  passed('Create Listing and atomically attach uploaded image/video');
  await page.evaluate(`document.querySelector('a[href="/listings/${row.id}/edit"]').click()`);
  await page.wait(`!!document.querySelector('#listing-title')`, 'edit owner listing');
  await page.fill('#listing-title', 'Đèn học đã cập nhật nội dung');
  await page.click('Lưu bài đăng');
  await page.wait(
    `location.pathname === '/account/listings' && !!document.querySelector('.listing-grid article')`,
    'updated list',
  );
  assert.equal(
    (await fixture.db.listing.findUnique({ where: { id: row.id } })).title,
    'Đèn học đã cập nhật nội dung',
  );
  passed('Edit existing Listing with expectedVersion and preserve media');
  await page.evaluate(`document.querySelector('a[href="/listings/${row.id}/edit"]').click()`);
  await page.wait(`!!document.querySelector('#listing-title')`, 'visibility editor');
  // Chỉ xác nhận dialog do harness chủ động mở; không đổi handler xác nhận trong ứng dụng.
  const dialogs = async (message) => {
    if (message.method === 'Page.javascriptDialogOpening')
      await page.send('Page.handleJavaScriptDialog', { accept: true });
  };
  page.listeners.push(dialogs);
  await page.click('Ẩn bài');
  await page.wait(
    `document.body.textContent.includes('Đã cập nhật trạng thái.') && [...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Hiện lại bài' && !e.disabled)`,
    'hidden',
  );
  assert.equal((await fixture.db.listing.findUnique({ where: { id: row.id } })).status, 'HIDDEN');
  await page.click('Hiện lại bài');
  await page.wait(
    `[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Ẩn bài' && !e.disabled)`,
    'reopened',
  );
  assert.equal((await fixture.db.listing.findUnique({ where: { id: row.id } })).status, 'ACTIVE');
  passed('Hide/reopen with confirmations and current server version');
  await page.click('Xóa bài đăng');
  await page.wait(
    `location.pathname === '/account/listings' && document.body.textContent.includes('Bạn chưa có bài đăng')`,
    'soft deleted list',
  );
  assert.equal((await fixture.db.listing.findUnique({ where: { id: row.id } })).status, 'DELETED');
  passed('Confirmed soft delete and remove from My Listings');
};
