#!/usr/bin/env node
/**
 * Fetches Fraunces and Instrument Sans from Google Fonts and writes the
 * woff2 files into src/assets/fonts/.
 *
 * Why a build step and not a CDN fetch at runtime?
 *   • Electron must work offline.
 *   • We set a strict CSP that forbids third-party network.
 *   • Licence of both families (SIL Open Font Licence 1.1) permits
 *     redistribution inside a packaged desktop app.
 *
 * Safe to re-run; skips files that already exist.
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = resolve(__dirname, '..', 'src', 'assets', 'fonts');
mkdirSync(FONT_DIR, { recursive: true });

const FAMILIES = [
  {
    name: 'Fraunces',
    file: 'Fraunces-VariableFont.woff2',
    italicFile: 'Fraunces-Italic-VariableFont.woff2',
    url:
      'https://fonts.googleapis.com/css2?' +
      'family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&display=swap'
  },
  {
    name: 'Instrument Sans',
    file: 'InstrumentSans-VariableFont.woff2',
    italicFile: 'InstrumentSans-Italic-VariableFont.woff2',
    url:
      'https://fonts.googleapis.com/css2?' +
      'family=Instrument+Sans:ital,wdth,wght@0,75..100,400..700;1,75..100,400..700&display=swap'
  }
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function get(url) {
  return new Promise((ok, fail) => {
    https
      .get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location).then(ok, fail);
        }
        if (res.statusCode !== 200) {
          return fail(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => ok(Buffer.concat(chunks)));
      })
      .on('error', fail);
  });
}

async function fetchFamily(fam) {
  const uprightPath = resolve(FONT_DIR, fam.file);
  const italicPath = resolve(FONT_DIR, fam.italicFile);
  if (existsSync(uprightPath) && existsSync(italicPath)) {
    return { family: fam.name, skipped: true };
  }

  const css = (await get(fam.url)).toString('utf8');
  const blocks = css.split('@font-face').filter((b) => b.includes('url('));

  let upright = null;
  let italic = null;
  for (const block of blocks) {
    const isItalic = /font-style:\s*italic/i.test(block);
    const match = block.match(/url\((https:[^)]+\.woff2)\)/);
    if (!match) continue;
    if (isItalic && !italic) italic = match[1];
    else if (!isItalic && !upright) upright = match[1];
    if (upright && italic) break;
  }

  if (!upright) throw new Error(`Could not find upright woff2 for ${fam.name}`);
  writeFileSync(uprightPath, await get(upright));
  if (italic) writeFileSync(italicPath, await get(italic));

  return { family: fam.name, skipped: false };
}

(async () => {
  try {
    for (const fam of FAMILIES) {
      const res = await fetchFamily(fam);
      console.log(`  ${res.skipped ? '·' : '+'} ${res.family}`);
    }
    console.log('fonts ready →', FONT_DIR);
  } catch (err) {
    // Never fail install on font download; app still runs with system fallback.
    console.warn('font fetch skipped:', err.message);
    console.warn('run `npm run fonts` later when you have a network.');
  }
})();
