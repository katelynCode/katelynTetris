import { test, expect } from '@playwright/test';

async function startGame(page) {
  await page.goto('/');
  await page.getByRole('button', { name: "Let's play", exact: true }).click();
}

test('home loads all artwork without console errors or horizontal overflow', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/Katelyn's Tetris/);
  await expect(page.getByRole('button', { name: "Let's play", exact: true })).toBeVisible();
  await expect(page.locator('.intro-copy')).toContainText('coding and pre-med');
  await expect(page.locator('#puzzle-select')).toHaveCount(0);
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('keyboard play, hold, drop, pause, resume and best-score persistence', async ({ page }) => {
  await startGame(page);
  await expect(page.locator('#board')).toHaveAttribute('data-state', 'playing');
  const first = await page.locator('#board').getAttribute('data-active');
  const x = Number(await page.locator('#board').getAttribute('data-x'));
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#board')).toHaveAttribute('data-x', String(x - 1));
  await page.keyboard.press('c');
  await expect(page.locator('#hold')).toHaveAttribute('class', /used/);
  await expect(page.locator('#hold .mini-piece')).toHaveAttribute('aria-label', `${first} piece`);
  await page.keyboard.press('Space');
  await expect(page.locator('#board')).toHaveAttribute('data-pieces', '1');
  await expect(page.locator('#score')).not.toHaveText('000000');
  await page.keyboard.press('p');
  await expect(page.locator('#board')).toHaveAttribute('data-state', 'paused');
  await page.getByRole('button', { name: 'Keep playing', exact: true }).click();
  await expect(page.locator('#board')).toHaveAttribute('data-state', 'playing');
  const best = await page.locator('#best').textContent();
  expect(Number(best.replaceAll(',', ''))).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('#best')).toHaveText(best);
});

test('touch buttons move, rotate, hold, and drop', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'On-screen controls are for phone layouts.');
  await startGame(page);
  await page.getByRole('button', { name: 'Move piece left', exact: true }).tap();
  await page.getByRole('button', { name: 'Rotate piece', exact: true }).tap();
  await page.getByRole('button', { name: 'Hold piece', exact: true }).tap();
  await page.getByRole('button', { name: 'Hard drop piece', exact: true }).tap();
  await expect(page.locator('#board')).toHaveAttribute('data-pieces', '1');
  await expect(page.locator('#hold .mini-piece')).toBeVisible();
});

test('restart confirmation cancels or resets a classic game', async ({ page }) => {
  await startGame(page);
  await page.keyboard.press('Space');
  await page.locator('#restart').click();
  await expect(page.locator('#restart-dialog')).toBeVisible();
  await page.locator('#cancel-restart').click();
  await expect(page.locator('#board')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#board')).toHaveAttribute('data-pieces', '1');
  await page.locator('#restart').click();
  await page.locator('#confirm-restart').click();
  await expect(page.locator('#board')).toHaveAttribute('data-pieces', '0');
  await expect(page.locator('#board')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#score')).toHaveText('000000');
  await expect(page.locator('#level')).toHaveText('01');
});

test('install help explains iOS and desktop steps', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Install app' }).click();
  await expect(page.locator('#install-dialog')).toBeVisible();
  await expect(page.locator('#install-dialog')).toContainText('iPhone / iPad');
  await expect(page.locator('#install-dialog')).toContainText('HTTPS');
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('#install-dialog')).not.toBeVisible();
});

test('portrait preference persists and does not change game rules', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Portrait tiles').uncheck();
  await page.reload();
  await expect(page.getByLabel('Portrait tiles')).not.toBeChecked();
  await page.getByRole('button', { name: "Let's play", exact: true }).click();
  await page.keyboard.press('Space');
  await expect(page.locator('#board')).toHaveAttribute('data-pieces', '1');
});

test('cached app and guide work offline with portrait assets', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#connection-status')).toHaveText('Ready for offline play');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: "Let's play", exact: true })).toBeVisible();
  await page.getByRole('button', { name: "Let's play", exact: true }).click();
  await page.keyboard.press('Space');
  await expect(page.locator('#board')).toHaveAttribute('data-pieces', '1');
  await expect(page.locator('#board')).toHaveAttribute('data-state', 'playing');
  expect(await page.evaluate(async () => (await fetch('./assets/T.jpg')).ok)).toBe(true);
  expect(await page.evaluate(async () => (await fetch('./landing.js')).ok)).toBe(true);
  await page.goto('/guide.html');
  await expect(page.getByRole('heading', { name: '01 / Find your flow' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '03 / Your game, to go' })).toBeVisible();
});

test('classic demo clears lines and never stores its score', async ({ page }) => {
  await page.goto('/?demo');
  await expect(page.locator('#board')).toHaveAttribute('data-state', 'demo');
  await expect.poll(async () => Number(await page.locator('#lines').textContent()), { timeout: 20000 }).toBeGreaterThan(0);
  await expect(page.locator('#best')).toHaveText('0');
  expect(await page.evaluate(() => localStorage.getItem('katelyn-best'))).toBeNull();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('katelyn-puzzle-')))).toEqual([]);
});

test('manifest and install icons have correct dimensions and relative scope', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  const manifest = await response.json();
  expect(manifest.name).toBe("Katelyn's Tetris");
  expect(manifest.start_url).toBe('./');
  expect(manifest.scope).toBe('./');
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) {
    const image = await request.get(`/${icon.src.slice(2)}`);
    expect(image.ok()).toBe(true);
    const body = await image.body();
    const size = Number(icon.sizes.split('x')[0]);
    expect(body.readUInt32BE(16)).toBe(size);
    expect(body.readUInt32BE(20)).toBe(size);
  }
});

test('small 320px viewport retains controls without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Hard drop piece', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'How to play' })).toBeVisible();
});

test('board gestures move and hard-drop pieces', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Gestures supplement mobile controls.');
  await startGame(page);
  const board = page.locator('#board');
  const bounds = await board.boundingBox();
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 3;
  const oldX = Number(await board.getAttribute('data-x'));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 35, y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Number(await board.getAttribute('data-x'))).toBeLessThan(oldX);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 80, { steps: 4 });
  await page.mouse.up();
  await expect(board).toHaveAttribute('data-pieces', '1');
});

test('losing focus pauses the game without changing the board', async ({ page }) => {
  await startGame(page);
  await page.keyboard.press('Space');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#board')).toHaveAttribute('data-state', 'paused');
  await page.waitForTimeout(1100);
  await expect(page.locator('#board')).toHaveAttribute('data-pieces', '1');
});

test('the guide video has playable metadata and captions', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Bundled WebKit media codecs vary by host OS.');
  await page.goto('/guide.html');
  await page.locator('video').evaluate(video => video.load());
  await page.waitForFunction(() => document.querySelector('video').readyState >= 1);
  const metadata = await page.locator('video').evaluate(video => ({
    duration: video.duration, width: video.videoWidth, height: video.videoHeight,
  }));
  expect(metadata.duration).toBeCloseTo(35, 0);
  expect(metadata.width).toBe(1000);
  expect(metadata.height).toBe(900);
  await expect(page.locator('track[kind=captions]')).toHaveAttribute('src', './media/gameplay.vtt');
  await page.waitForFunction(() => document.querySelector('track').readyState === 2);
});

test('classic best scores are restored and puzzle records remain untouched', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('katelyn-best', '1234');
    localStorage.setItem('katelyn-puzzle-first-fit', '140');
  });
  await startGame(page);
  await expect(page.locator('#best')).toHaveText('1,234');
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => localStorage.getItem('katelyn-puzzle-first-fit'))).toBe('140');
});

test('stacking too high ends the game and offers a fresh start', async ({ page }) => {
  await startGame(page);
  for (let i = 0; i < 30 && await page.locator('#board').getAttribute('data-state') === 'playing'; i++) {
    await page.keyboard.press('Space');
  }
  await expect(page.locator('#board')).toHaveAttribute('data-state', 'over');
  await expect(page.getByRole('button', { name: "Let's play again", exact: true })).toBeVisible();
  await page.locator('#start').click();
  await expect(page.locator('#board')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#board')).toHaveAttribute('data-pieces', '0');
});

test('pieces fall automatically and stop while paused', async ({ page }) => {
  await startGame(page);
  const startY = Number(await page.locator('#board').getAttribute('data-y'));
  await expect.poll(async () => Number(await page.locator('#board').getAttribute('data-y'))).toBeGreaterThan(startY);
  await page.keyboard.press('p');
  const pausedY = await page.locator('#board').getAttribute('data-y');
  await page.waitForTimeout(1000);
  await expect(page.locator('#board')).toHaveAttribute('data-y', pausedY);
});

test('landing video actually autoplays muted inline, pauses and resumes', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Bundled WebKit video decoding depends on the host OS.');
  await page.goto('/');
  const video = page.locator('#gameplay-preview');
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0.2);
  expect(await video.evaluate(element => element.muted && element.playsInline && element.autoplay)).toBe(true);
  await page.getByRole('button', { name: 'Pause preview', exact: true }).click();
  expect(await video.evaluate(element => element.paused)).toBe(true);
  await page.getByRole('button', { name: 'Play preview', exact: true }).click();
  await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
  await page.getByRole('button', { name: "Let's play", exact: true }).click();
  expect(await video.evaluate(element => element.paused)).toBe(true);
});

test('reduced-motion preference keeps the landing preview paused', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#preview-status')).toContainText('Reduced motion is on');
  expect(await page.locator('#gameplay-preview').evaluate(video => video.paused && !video.autoplay)).toBe(true);
  await expect(page.getByRole('button', { name: 'Play preview', exact: true })).toBeVisible();
});

test.describe('preview failure handling', () => {
  test.use({ serviceWorkers: 'block' });

 test('blocked autoplay offers an explicit manual play fallback', async ({ page }) => {
   await page.addInitScript(() => {
     Object.defineProperty(HTMLMediaElement.prototype, 'autoplay', { get: () => false, set: () => {} });
     HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Autoplay blocked in test', 'NotAllowedError'));
   });
   await page.goto('/');
   await expect(page.locator('#preview-status')).toContainText('Select Play preview');
   await expect(page.getByRole('button', { name: 'Play preview', exact: true })).toBeEnabled();
 });

 test('missing preview is reported without preventing play', async ({ page }) => {
   await page.route('**/', async route => {
     const response = await route.fetch();
     const body = (await response.text()).replace('src="./media/gameplay.mp4"', 'src="./media/missing.mp4"');
     await route.fulfill({ response, body });
   });
   await page.goto('/');
   await expect(page.locator('#preview-status')).toContainText('Preview unavailable');
   await expect(page.locator('#video-toggle')).toBeDisabled();
   await page.getByRole('button', { name: "Let's play", exact: true }).click();
   await expect(page.locator('#board')).toHaveAttribute('data-state', 'playing');
 });
});

test('violet theme and enlarged installation control fit desktop and phone layouts', async ({ page }) => {
  await page.goto('/');
  const size = await page.locator('#install').boundingBox();
  const icon = await page.locator('.install-icon').boundingBox();
  expect(size.height).toBeGreaterThanOrEqual(50);
  expect(icon.width).toBeGreaterThanOrEqual(28);
  expect(icon.height).toBeGreaterThanOrEqual(28);
  expect(await page.locator('#install').evaluate(button => getComputedStyle(button).backgroundColor)).toBe('rgb(115, 82, 184)');
  await expect(page.getByText('Pre-med interest', { exact: true })).toBeVisible();
  await expect(page.locator('.interest-tags').getByText(/Coding curiosity/)).toBeVisible();
});
