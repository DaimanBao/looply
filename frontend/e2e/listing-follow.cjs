const assert = require('node:assert/strict');

/** Kiểm chứng một luồng Follow thật qua guest/login/list/detail và đổi tài khoản trên browser. */
module.exports = async function follow({ page, fixture, owner, listing, passed }) {
  const viewer = await fixture.user();
  const second = await fixture.user();
  const eventCount = await fixture.db.outboxEvent.count({ where: { aggregateId: listing.id } });
  await page.navigate(
    `/listings/${listing.id}`,
    `!!document.querySelector('app-listing-follow a')`,
  );
  assert.equal(
    await page.evaluate(
      `document.querySelector('app-listing-follow a').textContent.includes('Đăng nhập')`,
    ),
    true,
  );
  await page.evaluate(`document.querySelector('app-listing-follow a').click()`);
  await page.wait(
    `!!document.querySelector('input[formcontrolname=username]')`,
    'guest login invitation',
  );
  /** Đăng nhập bằng form thực, không đưa credential vào báo cáo hoặc inject token. */
  async function login(user) {
    await page.fill('input[formcontrolname=username]', user.username);
    await page.fill('input[formcontrolname=password]', 'Fixture passphrase 928!');
    await page.click('Đăng nhập');
    await page.wait(
      `[...document.querySelectorAll('app-listing-follow button')].some(e=>!e.disabled)`,
      'authenticated follow control',
    );
  }
  await login(viewer);
  assert.equal(await page.evaluate(`location.pathname === '/listings/${listing.id}'`), true);
  passed('Guest invitation returns to Listing after real login');
  await page.click('Theo dõi bài đăng');
  await page.wait(
    `!!document.querySelector('app-listing-follow button[aria-pressed=true]:not(:disabled)')`,
    'follow success',
  );
  assert.equal(
    await fixture.db.listingFollow.count({ where: { userId: viewer.id, listingId: listing.id } }),
    1,
  );
  passed('Follow through real PUT and unique relation');
  await page.evaluate(`document.querySelector('a[href="/account/followed-listings"]').click()`);
  await page.wait(
    `!!document.querySelector('app-listing-card app-listing-follow button[aria-pressed=true]:not(:disabled)')`,
    'followed list',
  );
  passed('Followed list includes public Listing and current Follow state');
  await page.evaluate(`document.querySelector('a[href="/"]').click()`);
  await page.wait(`!!document.querySelector('input[type=search]')`, 'discovery');
  await page.fill('input[type=search]', listing.title);
  await page.wait(
    `!!document.querySelector('app-listing-card app-listing-follow button[aria-pressed=true]:not(:disabled)')`,
    'discovery follow state',
  );
  passed('Discovery uses server/shared Follow state after navigation');
  await page.click('Bỏ theo dõi');
  await page.wait(
    `!!document.querySelector('app-listing-follow button[aria-pressed=false]:not(:disabled)')`,
    'unfollow success',
  );
  assert.equal(
    await fixture.db.listingFollow.count({ where: { userId: viewer.id, listingId: listing.id } }),
    0,
  );
  await page.evaluate(`document.querySelector('a[href="/account/followed-listings"]').click()`);
  await page.wait(
    `document.body.textContent.includes('Chưa có bài đăng theo dõi hiển thị')`,
    'empty followed list',
  );
  passed('Unfollow from Discovery updates relation and followed empty state');
  await page.navigate(
    `/listings/${listing.id}`,
    `!!document.querySelector('app-listing-follow button[aria-pressed=false]:not(:disabled)')`,
  );
  await page.click('Theo dõi bài đăng');
  await page.wait(
    `!!document.querySelector('app-listing-follow button[aria-pressed=true]:not(:disabled)')`,
    'refollow',
  );
  await page.click('Đăng xuất');
  await page.wait(`location.pathname === '/auth/login'`, 'logout navigation');
  await page.navigate(
    `/listings/${listing.id}`,
    `!!document.querySelector('app-listing-follow a') && !document.querySelector('app-listing-follow button')`,
  );
  await page.evaluate(`document.querySelector('app-listing-follow a').click()`);
  await page.wait(`!!document.querySelector('input[formcontrolname=username]')`, 'second login');
  await login(second);
  assert.equal(
    await page.evaluate(
      `!!document.querySelector('app-listing-follow button[aria-pressed=false]')`,
    ),
    true,
  );
  assert.equal(
    await fixture.db.listingFollow.count({ where: { userId: viewer.id, listingId: listing.id } }),
    1,
  );
  assert.equal(
    await fixture.db.listingFollow.count({ where: { userId: second.id, listingId: listing.id } }),
    0,
  );
  passed('Account switch clears previous Follow while preserving first account relation');
  await page.click('Đăng xuất');
  await page.wait(`location.pathname === '/auth/login'`, 'second logout navigation');
  await page.navigate(
    `/listings/${listing.id}`,
    `!!document.querySelector('app-listing-follow a')`,
  );
  await page.evaluate(`document.querySelector('app-listing-follow a').click()`);
  await page.wait(`!!document.querySelector('input[formcontrolname=username]')`, 'owner login');
  await page.fill('input[formcontrolname=username]', owner.username);
  await page.fill('input[formcontrolname=password]', 'Fixture passphrase 928!');
  await page.click('Đăng nhập');
  await page.wait(
    `!!document.querySelector('app-listing-follow a[href="/listings/${listing.id}/edit"]')`,
    'owner management',
  );
  assert.equal(await page.evaluate(`!!document.querySelector('app-listing-follow button')`), false);
  assert.equal(
    await fixture.db.outboxEvent.count({ where: { aggregateId: listing.id } }),
    eventCount,
  );
  passed('Owner has management instead of self Follow; Follow does not emit outbox notification');
};
