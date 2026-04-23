#!/usr/bin/env node
/**
 * Copies third-party runtime files into src/vendor/ so the app can load
 * them via the same-origin CSP (`script-src 'self'`) and so electron-builder
 * includes them in the asar bundle.
 */

import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const VENDOR = resolve(ROOT, 'src', 'vendor');
mkdirSync(VENDOR, { recursive: true });

const targets = [
  {
    from: resolve(ROOT, 'node_modules', 'lottie-web', 'build', 'player', 'lottie.min.js'),
    to: resolve(VENDOR, 'lottie.min.js')
  }
];

for (const t of targets) {
  if (!existsSync(t.from)) {
    console.warn('vendor src missing:', t.from);
    continue;
  }
  copyFileSync(t.from, t.to);
  console.log('  + vendor/' + t.to.replace(VENDOR + '/', '').replace(VENDOR + '\\', ''));
}
