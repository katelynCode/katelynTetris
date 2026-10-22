import { chromium } from '@playwright/test';
import ffmpeg from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { mkdir, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const root = fileURLToPath(new URL('..', import.meta.url));
const media = path.join(root, 'public', 'media');
const temporary = path.join(root, '.recording');
await mkdir(media, { recursive: true });
await mkdir(temporary, { recursive: true });
const port = '4180';
const server = spawn(process.execPath, [path.join(root, 'scripts', 'serve.mjs')], {
  cwd: root, env: { ...process.env, PORT: port }, stdio: 'inherit',
});
let browser;
async function encode(args) {
  await new Promise((resolve, reject) => {
    const encoder = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let diagnostics = '';
    encoder.stderr.on('data', data => { diagnostics += data; });
    encoder.on('error', reject);
    encoder.on('exit', code => code === 0 ? resolve() : reject(new Error(diagnostics)));
  });
}
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (server.exitCode !== null) throw new Error(`Preview server exited with ${server.exitCode}`);
    try { ready = (await fetch(`http://127.0.0.1:${port}`)).ok; }
    catch (error) {
      if (error.cause?.code !== 'ECONNREFUSED') throw error;
    }
    if (ready) break;
    await setTimeout(200);
  }
  if (!ready) throw new Error('Recording server did not become ready.');
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1120 },
    recordVideo: { dir: temporary, size: { width: 1280, height: 1120 } },
    reducedMotion: 'reduce',
  });
  const recordingStarted = Date.now();
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth));
  await page.getByRole('button', { name: 'Watch a little demo' }).click();
  const offset = (Date.now() - recordingStarted) / 1000 + 0.3;
  const bounds = await page.locator('.game-layout').boundingBox();
  if (!bounds || bounds.y < 0 || bounds.y + bounds.height > 1120) {
    throw new Error(`Gameplay does not fit the recording viewport: ${JSON.stringify(bounds)}`);
  }
  const [width, height, x, y] = [bounds.width, bounds.height, bounds.x, bounds.y].map(value => Math.floor(value / 2) * 2);
  await page.waitForTimeout(36500);
  const lines = Number(await page.locator('#lines').textContent());
  const score = Number(await page.locator('#score').textContent());
  if (lines < 1 || score < 100 || failures.length) {
    throw new Error(`Demo failed: ${lines} lines, score ${score}, errors: ${failures.join('; ')}`);
  }
  const recording = await page.video().path();
  await context.close();
  await encode([
    '-y', '-ss', String(offset), '-i', recording, '-t', '35', '-an',
    '-vf', `crop=${width}:${height}:${x}:${y},scale=1000:900:force_original_aspect_ratio=decrease,pad=1000:900:(ow-iw)/2:(oh-ih)/2:color=0xfaf8ff,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '25', '-movflags', '+faststart',
    path.join(media, 'gameplay.mp4'),
  ]);
  await encode(['-y', '-ss', '12', '-i', path.join(media, 'gameplay.mp4'), '-frames:v', '1', '-q:v', '3', path.join(media, 'gameplay-poster.jpg')]);
  const preview = await browser.newPage({ viewport: { width: 1280, height: 1120 }, reducedMotion: 'reduce' });
  await preview.goto(`http://127.0.0.1:${port}`);
  await preview.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth));
  await preview.waitForFunction(() => document.querySelector('#gameplay-preview').readyState >= 2);
  await preview.locator('#gameplay-preview').evaluate(async video => {
    await video.play();
    video.pause();
    await new Promise(resolve => {
      video.requestVideoFrameCallback(resolve);
      video.currentTime = 12;
    });
  });
  await preview.screenshot({ path: path.join(media, 'preview.png'), fullPage: true });
  await unlink(recording);
  await rmdir(temporary);
  console.log(`Recorded 35 seconds of classic gameplay: ${lines} lines, ${score} points. Gameplay-only MP4, poster, and landing preview saved in public/media.`);
} finally {
  await browser?.close();
  server.kill();
}
