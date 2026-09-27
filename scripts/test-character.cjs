'use strict';
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs');
const { createServer } = require('./serve-character.cjs');
const out = path.resolve(__dirname, '../artifacts/character-preview');
const shots = path.join(out, 'screens');

// Playwright's WebKit screenshots inject a stylesheet that the page's CSP rightly refuses.
let capturing = 0;
const harnessNoise = (text) => capturing > 0 && text.startsWith('Refused to apply a stylesheet');
async function open(browser, url, options) {
  const errors = [], remote = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, ...options });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !harnessNoise(m.text())) errors.push(m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(url)) remote.push(r.url()); });
  await page.goto(url);
  await page.waitForFunction(() => window.characterStudy?.state.ready, {}, { timeout: 60000 });
  return { page, errors, remote };
}
const study = (page, fn, arg) => page.evaluate(fn, arg);
async function capture(target, options = {}) {
  capturing++;
  try { const image = await target.screenshot({ caret: 'initial', ...options }); await new Promise((r) => setTimeout(r, 30)); return image; }
  finally { capturing--; }
}
const pixels = async (page) => (await capture(page.locator('#viewport canvas'))).toString('base64');

async function reducedMotion(browser, url, name) {
  const { page, errors, remote } = await open(browser, url, { reducedMotion: 'reduce' });
  assert.equal(await study(page, () => characterStudy.state.running), false, 'reduced motion should start paused');
  assert.ok(await study(page, () => characterStudy.state.time > 0), 'reduced motion should show a representative still');
  const still = await pixels(page); await page.waitForTimeout(150);
  assert.equal(await pixels(page), still, 'reduced motion still moved');

  const exercises = await study(page, () => characterStudy.exercises.map((e) => ({ id: e.id, title: e.title })));
  const buttons = page.locator('#library button');
  assert.equal(await buttons.count(), exercises.length, 'library lists every exercise');
  const frames = new Set();
  for (const [i, ex] of exercises.entries()) {
    await buttons.nth(i).click();
    assert.equal(await study(page, () => characterStudy.state.id), ex.id);
    assert.equal(await page.locator('#title').textContent(), ex.title);
    assert.equal(await buttons.nth(i).getAttribute('aria-current'), 'true');
    await page.waitForTimeout(60);
    frames.add(await pixels(page));
    if (name === 'chromium') await page.locator('.stage').screenshot({ caret: 'initial', path: path.join(shots, `${ex.id}.png`) });
  }
  assert.equal(frames.size, exercises.length, 'every exercise renders a distinct pose');

  await study(page, () => characterStudy.renderAt(3.4, 'neck-turn'));
  const views = new Set();
  for (const view of ['front', 'three-quarter', 'side', 'guide']) {
    await page.locator(`[data-view="${view}"]`).click();
    await page.waitForTimeout(60);
    assert.equal(await study(page, () => characterStudy.state.time), 3.4, 'camera changed playback');
    assert.equal(await page.locator(`[data-view="${view}"]`).getAttribute('aria-pressed'), 'true');
    views.add(await pixels(page));
    if (name === 'chromium') await page.locator('.stage').screenshot({ caret: 'initial', path: path.join(shots, `view-${view}.png`) });
  }
  assert.equal(views.size, 4, 'each camera view frames the guide differently');

  if (name === 'chromium') await capture(page, { path: path.join(out, 'review.png') });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150);
  assert.equal(await study(page, () => document.documentElement.scrollWidth > innerWidth), false, 'mobile layout overflows');
  if (name === 'chromium') await capture(page, { path: path.join(out, 'mobile.png'), fullPage: true });
  assert.deepEqual(errors, []); assert.deepEqual(remote, [], 'external asset requests');
  await page.close();
}

async function playback(browser, url) {
  const { page, errors, remote } = await open(browser, url, { reducedMotion: 'no-preference' });
  assert.equal(await study(page, () => characterStudy.state.running), true, 'guide autoplays');
  const t0 = await study(page, () => characterStudy.state.time);
  await page.waitForTimeout(500);
  assert.ok(await study(page, (t) => characterStudy.state.time > t + .2, t0), 'playback did not advance');

  await page.locator('#play').click();
  assert.equal(await page.locator('#play').getAttribute('aria-pressed'), 'false');
  const paused = await study(page, () => characterStudy.state.time);
  const frame = await pixels(page); await page.waitForTimeout(150);
  assert.equal(await study(page, () => characterStudy.state.time), paused, 'pause did not hold time');
  assert.equal(await pixels(page), frame, 'paused guide kept rendering changes');

  await page.locator('#scrubber').fill('12');
  assert.equal(await study(page, () => characterStudy.state.time), 12, 'scrubber did not seek');
  await page.locator('#restart').click();
  assert.equal(await study(page, () => characterStudy.state.time), 0, 'restart did not rewind');

  await page.locator('#viewport').focus(); await page.keyboard.press('Space');
  assert.equal(await study(page, () => characterStudy.state.running), true, 'space did not resume');

  await page.locator('#library button').nth(4).click();
  await page.waitForFunction((id) => characterStudy.state.id === id, await study(page, () => characterStudy.exercises[4].id));
  assert.ok(await study(page, () => characterStudy.state.time < 1), 'new exercise should start from the top');
  assert.deepEqual(errors, []); assert.deepEqual(remote, [], 'external asset requests');
  await page.close();
}

async function main() {
  fs.mkdirSync(shots, { recursive: true });
  const server = createServer(); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
      const browser = await engine.launch({ headless: true });
      try {
        await reducedMotion(browser, url, name);
        await playback(browser, url);
        console.log(`PASS ${name}: local-only assets, every exercise from the library, camera views keep time, reduced motion, play/pause/scrub/restart/keyboard, mobile layout.`);
      } finally { await browser.close(); }
    }
    console.log(`Screens saved to ${path.relative(process.cwd(), shots)}`);
  } finally { await new Promise((r) => server.close(r)); }
}
main().catch((error) => { console.error(error); process.exit(1); });
