#!/usr/bin/env node
/**
 * patch-electron-plist.mjs
 *
 * In dev mode, the Electron binary's Info.plist has no LSUIElement key,
 * so macOS shows the Electron icon in the dock. This script patches
 * the dev binary's plist to add LSUIElement=true, making the app
 * behave as a tray-only agent in dev mode too.
 *
 * Only runs on macOS. Harmless no-op on other platforms.
 * Safe to re-run — idempotent.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.platform !== 'darwin') {
  console.log('patch-electron-plist: not macOS, skipping.');
  process.exit(0);
}

const plist = resolve('node_modules/electron/dist/Electron.app/Contents/Info.plist');
if (!existsSync(plist)) {
  console.warn('patch-electron-plist: Electron.app not found at expected path, skipping.');
  process.exit(0);
}

try {
  // Check if already set
  const current = execSync(
    `/usr/libexec/PlistBuddy -c "Print :LSUIElement" "${plist}" 2>&1`,
    { encoding: 'utf8' }
  ).trim();
  if (current === 'true' || current === '1') {
    console.log('patch-electron-plist: LSUIElement already set, skipping.');
    process.exit(0);
  }
} catch {
  // Key doesn't exist yet — we'll add it
}

try {
  execSync(
    `/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "${plist}" 2>/dev/null || ` +
    `/usr/libexec/PlistBuddy -c "Set :LSUIElement true" "${plist}"`,
    { encoding: 'utf8', shell: '/bin/zsh' }
  );
  console.log('patch-electron-plist: ✓ Set LSUIElement=true in Electron.app Info.plist');
} catch (err) {
  console.warn('patch-electron-plist: failed to patch —', err.message);
}
