#!/usr/bin/env node
/**
 * Produces three things from logo.png:
 *
 *   build/icon.ico        - multi-size ICO consumed by electron-builder
 *                           (installer + window icon embedded into the EXE).
 *   src/assets/icon.ico   - same bytes, but inside the app bundle so the
 *                           running app can actually load it at runtime.
 *                           build/ is a build resource and is NOT packaged
 *                           into app.asar, which is why the tray icon
 *                           was invisible after install.
 *   src/assets/tray.png   - 32 px PNG fallback. Windows Tray also accepts
 *                           ICO, but a PNG is a cheap safety net if the
 *                           ICO ever fails to decode on a user's machine.
 *
 * Why the extra care for the ICO layout:
 *   NSIS 3.0.4.1 (what electron-builder 26 bundles) rejects ICOs whose
 *   entries are a single giant PNG-encoded frame. Feeding png-to-ico a
 *   raw 1024x1024 logo yields exactly that and NSIS fails with
 *   "invalid icon file size". Fix: resize to the standard Windows icon
 *   dimensions first, then stack them.
 *
 *   We also sniff the PNG magic bytes up front so a JPEG-renamed-to-.png
 *   fails loudly here instead of surfacing as a cryptic error three
 *   steps later.
 *
 * Run whenever the logo changes:  npm run icons
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'logo.png');

const BUILD_DIR = resolve(ROOT, 'build');
const BUILD_ICO = resolve(BUILD_DIR, 'icon.ico');

const ASSETS_DIR = resolve(ROOT, 'src', 'assets');
const APP_ICO = resolve(ASSETS_DIR, 'icon.ico');
const TRAY_PNG = resolve(ASSETS_DIR, 'tray.png');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

mkdirSync(BUILD_DIR, { recursive: true });
mkdirSync(ASSETS_DIR, { recursive: true });

if (!existsSync(SRC)) {
  console.warn('logo.png missing - skipping icon build');
  process.exit(0);
}

const srcBytes = readFileSync(SRC);
if (!srcBytes.subarray(0, 8).equals(PNG_MAGIC)) {
  const head = [...srcBytes.subarray(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  console.error(
    `logo.png is not a PNG (magic bytes: ${head}). ` +
    'Re-export it as a real PNG - a JPEG renamed to .png will not work here.'
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

  // Resize once per ICO frame. fit: 'contain' keeps the logo centred if
  // the source isn't perfectly square and pads with transparent pixels
  // so the icon never looks stretched in the shell.
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

  const ico = await toIco(framesPng);
  writeFileSync(BUILD_ICO, ico);
  copyFileSync(BUILD_ICO, APP_ICO);

  // A plain 32 px PNG is a good tray fallback. Windows scales it for
  // higher DPIs; macOS gets a template-sized copy elsewhere.
  const trayPng = await sharp(srcBytes)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(TRAY_PNG, trayPng);

  console.log(`icon.ico (build)  -> ${BUILD_ICO}  (${SIZES.join(', ')} px, ${ico.length} bytes)`);
  console.log(`icon.ico (app)    -> ${APP_ICO}`);
  console.log(`tray.png (32 px)  -> ${TRAY_PNG}`);

  // ── macOS: .icns icon ──────────────────────────────────────────────
  let png2icons;
  try {
    png2icons = (await import('png2icons')).default || (await import('png2icons'));
  } catch {
    console.warn('png2icons not installed — skipping .icns. Run: npm i -D png2icons');
  }

  if (png2icons) {
    const BUILD_ICNS = resolve(BUILD_DIR, 'icon.icns');
    const input1024 = await sharp(srcBytes)
      .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const icnsBuffer = png2icons.createICNS(input1024, png2icons.RESIZE_BILINEAR, 0);
    if (icnsBuffer) {
      writeFileSync(BUILD_ICNS, icnsBuffer);
      console.log(`icon.icns          -> ${BUILD_ICNS}  (${icnsBuffer.length} bytes)`);
    } else {
      console.error('png2icons.createICNS returned null');
      process.exit(1);
    }
  }

  // ── macOS: template tray icons ─────────────────────────────────────
  // Template images: macOS uses ONLY the alpha channel as a mask.
  // Must be black-on-transparent. The OS tints automatically for dark/light.
  //
  // Strategy:
  //   - If the source has a real alpha channel → use it directly as the mask.
  //   - If the source is opaque (RGB, no alpha) → derive the mask from
  //     luminance: bright pixels → opaque, dark/background pixels → transparent.
  const TRAY_TEMPLATE = resolve(ASSETS_DIR, 'tray-Template.png');
  const TRAY_TEMPLATE_2X = resolve(ASSETS_DIR, 'tray-Template@2x.png');

  const srcMeta = await sharp(srcBytes).metadata();
  const sourceHasAlpha = srcMeta.hasAlpha;
  console.log(`Template icon source: ${srcMeta.width}x${srcMeta.height}, hasAlpha=${sourceHasAlpha}`);

  async function makeTemplate(size, dest) {
    const resized = sharp(srcBytes)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
    const { data, info } = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    const total = info.width * info.height;
    const pixels = new Uint8Array(total * 4);

    if (sourceHasAlpha) {
      // Use the original alpha channel as the silhouette mask
      for (let i = 0; i < total; i++) {
        pixels[i * 4 + 0] = 0;           // R = black
        pixels[i * 4 + 1] = 0;           // G = black
        pixels[i * 4 + 2] = 0;           // B = black
        pixels[i * 4 + 3] = data[i * 4 + 3]; // A = original alpha
      }
    } else {
      // Source is opaque — derive mask from luminance.
      // Perceived luminance: 0.299R + 0.587G + 0.114B
      // We use luminance as the alpha value so brighter logo pixels
      // become more visible in the menu bar icon.
      for (let i = 0; i < total; i++) {
        const r = data[i * 4 + 0];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        pixels[i * 4 + 0] = 0;   // R = black
        pixels[i * 4 + 1] = 0;   // G = black
        pixels[i * 4 + 2] = 0;   // B = black
        pixels[i * 4 + 3] = lum; // A = luminance → brighter = more opaque
      }
    }

    const buf = await sharp(Buffer.from(pixels.buffer), {
      raw: { width: info.width, height: info.height, channels: 4 }
    }).png({ compressionLevel: 9 }).toBuffer();
    writeFileSync(dest, buf);
    console.log(`tray-Template (${size} px) -> ${dest}  (${buf.length} bytes)`);
  }

  await makeTemplate(20, TRAY_TEMPLATE);
  await makeTemplate(40, TRAY_TEMPLATE_2X);
})();
