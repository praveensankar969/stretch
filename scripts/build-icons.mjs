#!/usr/bin/env node
/**
 * Produces build/icon.ico (16/24/32/48/64/128/256 multi-resolution)
 * from logo.png for the NSIS installer, window, and tray.
 *
 * Run whenever the logo changes:  npm run icons
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'logo.png');
const OUT_DIR = resolve(ROOT, 'build');
const OUT = resolve(OUT_DIR, 'icon.ico');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

mkdirSync(OUT_DIR, { recursive: true });

if (!existsSync(SRC)) {
  console.warn('logo.png missing — skipping icon build');
  process.exit(0);
}

const srcBytes = readFileSync(SRC);
if (!srcBytes.subarray(0, 8).equals(PNG_MAGIC)) {
  const head = [...srcBytes.subarray(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  console.error(
    `logo.png is not a PNG (magic bytes: ${head}). ` +
    'Re-export it as a real PNG — a JPEG renamed to .png will not work here.'
  );
  process.exit(1);
}

(async () => {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn('sharp not installed; run `npm i -D sharp` and rerun `npm run icons`.');
    process.exit(0);
  }

  let toIco;
  try {
    toIco = (await import('png-to-ico')).default;
  } catch {
    console.warn('png-to-ico not installed; run `npm i -D png-to-ico` and rerun `npm run icons`.');
    process.exit(0);
  }

  const framesPng = await Promise.all(
    SIZES.map((n) =>
      sharp(srcBytes)
        .resize(n, n, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png({ compressionLevel: 9 })
        .toBuffer()
    )
  );

  const buf = await toIco(framesPng);
  writeFileSync(OUT, buf);
  console.log(`icon.ico → ${OUT}  (${SIZES.join(', ')} px, ${buf.length} bytes)`);
})();
