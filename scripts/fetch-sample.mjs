#!/usr/bin/env node
// Downloads a small public-domain test clip into public/sample.mp4 so the
// hosted app has a one-click "Load sample" option. CC-BY 3.0 Blender Foundation.
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(__dirname, '..', 'public', 'sample.mp4');

const SOURCES = [
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
  'https://download.blender.org/peach/bigbuckbunny_movies/big_buck_bunny_480p_5mb.mp4',
];

try {
  const existing = await stat(out).catch(() => null);
  if (existing && existing.size > 100_000) {
    console.log(`sample.mp4 already present (${existing.size} bytes), skipping.`);
    process.exit(0);
  }

  for (const url of SOURCES) {
    try {
      console.log(`Fetching ${url} ...`);
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength < 100_000) throw new Error(`Too small (${buf.byteLength} bytes)`);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, buf);
      console.log(`Saved ${out} (${buf.byteLength} bytes).`);
      process.exit(0);
    } catch (err) {
      console.warn(`  ${url} failed: ${err.message}`);
    }
  }

  console.error('All sample sources failed. Continuing without a bundled sample.');
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(0); // never block the build
}
