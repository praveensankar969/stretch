import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import sharp from "sharp";
import toIco from "png-to-ico";
import png2icons from "png2icons";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = resolve(root, "build"),
  assets = resolve(root, "src/assets");
mkdirSync(build, { recursive: true });
mkdirSync(assets, { recursive: true });
const svg = readFileSync(resolve(assets, "mark.svg"));
const png = await sharp(svg).resize(1024, 1024).png().toBuffer();
const ico = await toIco(
  await Promise.all(
    [16, 24, 32, 48, 64, 128, 256].map((size) =>
      sharp(svg).resize(size, size).png().toBuffer(),
    ),
  ),
);
writeFileSync(resolve(build, "icon.ico"), ico);
writeFileSync(resolve(assets, "icon.ico"), ico);
const icns = png2icons.createICNS(png, png2icons.RESIZE_BILINEAR, 0);
if (!icns) throw new Error("Could not generate macOS icon");
writeFileSync(resolve(build, "icon.icns"), icns);
writeFileSync(
  resolve(assets, "tray.png"),
  await sharp(svg).resize(32, 32).png().toBuffer(),
);
const template = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="4" r="2" fill="black"/><path d="m3 7 7 3 7-3m-7 3v3m0 0-4 5m4-5 4 5" fill="none" stroke="black" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
);
for (const size of [20, 40])
  writeFileSync(
    resolve(assets, `tray-Template${size === 40 ? "@2x" : ""}.png`),
    await sharp(template).resize(size, size).png().toBuffer(),
  );
console.log("Built Mac, Windows, and menu bar icons.");
