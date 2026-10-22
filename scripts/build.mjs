import { cp, mkdir, readdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'public');
const destination = path.join(root, 'dist');
await mkdir(destination, { recursive: true });
await rm(path.join(destination, 'puzzles.js'), { force: true });
await cp(source, destination, { recursive: true });
for (const name of ['LICENSE', 'PHOTO-LICENSE.md']) {
  await cp(path.join(root, name), path.join(destination, name));
}
const hash = createHash('sha256');
async function fingerprint(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await fingerprint(target);
    else hash.update(entry.name).update(await readFile(target));
  }
}
await fingerprint(source);
const worker = await readFile(path.join(source, 'sw.js'), 'utf8');
await writeFile(path.join(destination, 'sw.js'), worker.replace('development-classic-violet-v1', hash.digest('hex').slice(0, 16)));
console.log('Built static PWA in dist. Service worker version is content-derived.');
