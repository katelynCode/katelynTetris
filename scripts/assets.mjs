import sharp from 'sharp';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'public', 'assets');
await mkdir(output, { recursive: true });
const crop = { left: 302, top: 176, width: 256, height: 320 };
const source = path.join(root, 'Image (60).jpg');
await sharp(source).rotate().extract(crop).resize(480, 600)
  .jpeg({ quality: 94 }).toFile(path.join(root, 'Katelyn.jpg'));
await copyFile(path.join(root, 'Katelyn.jpg'), path.join(output, 'Katelyn.jpg'));

const colors = {
  I: '#51bfc6', O: '#edbd56', T: '#aa8ed1', S: '#74b890',
  Z: '#e68885', J: '#729bdb', L: '#e9a26b',
};
// Hand-traced masks are specific to the supplied portrait, in original image coordinates.
const silhouette = '319,496 335,405 337,377 344,359 364,350 380,344 375,324 374,293 379,255 388,226 408,209 434,202 456,207 478,220 491,249 494,297 500,333 505,351 519,362 525,385 525,422 531,496';
const dress = '367,496 368,412 370,385 379,389 400,395 425,411 440,407 464,398 497,391 497,426 488,496';
for (const [shape, color] of Object.entries(colors)) {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="320" viewBox="302 176 256 320">
    <defs><mask id="background"><rect x="302" y="176" width="256" height="320" fill="white"/><polygon points="${silhouette}" fill="black"/></mask></defs>
    <rect x="302" y="176" width="256" height="320" fill="${color}" opacity=".83" mask="url(#background)"/>
    <polygon points="${dress}" fill="${color}" opacity=".68"/>
    <path d="M374 388 L379 352 M493 393 L498 355" stroke="${color}" stroke-width="3" opacity=".65"/>
  </svg>`);
  const cropped = await sharp(source).rotate().extract(crop).toBuffer();
  const recolored = await sharp(cropped).composite([{ input: svg }]).toBuffer();
  await sharp(recolored).resize(240, 300).jpeg({ quality: 89 }).toFile(path.join(output, `${shape}.jpg`));
}

const icon = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="100" fill="#7352b8"/>
  <g stroke="#7352b8" stroke-width="12">
    <rect x="136" y="136" width="120" height="120" rx="24" fill="#f0b7a5"/>
    <rect x="256" y="136" width="120" height="120" rx="24" fill="#b4d8cb"/>
    <rect x="136" y="256" width="120" height="120" rx="24" fill="#bba5d8"/>
    <rect x="256" y="256" width="120" height="120" rx="24" fill="#f0ca78"/>
  </g>
  <path d="M208 165v64m0-30 29-32m-29 32 31 31" fill="none" stroke="#493260" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`);
for (const size of [192, 512, 180]) {
  await sharp(icon).resize(size, size).png().toFile(path.join(output, `icon-${size}.png`));
}
console.log('Created Katelyn.jpg, seven portrait colorways, and three app icons.');
