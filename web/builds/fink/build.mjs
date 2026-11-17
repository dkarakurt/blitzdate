// Tek dosyalık sürüm: CSS, fontlar (data URI) ve betikler index.html'in içine gömülür.
// Kullanım: node build.mjs  →  dist/index.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

let fonts = read('assets/fonts.css').replace(/url\("fonts\/([^"]+)"\)/g, (_, f) =>
  `url("data:font/woff2;base64,${readFileSync(join(root, 'assets/fonts', f)).toString('base64')}")`);

let html = read('index.html');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error('bulunamadı: ' + from);
  html = html.replace(from, () => to);
};
swap('<link rel="stylesheet" href="assets/fonts.css">', `<style>${fonts}</style>`);
swap('<link rel="stylesheet" href="scrollcraft.css">', `<style>${read('scrollcraft.css')}</style>`);
swap('<link rel="stylesheet" href="site.css">', `<style>${read('site.css')}</style>`);
swap('<script src="assets/fink-logic.js"></script>', `<script>${read('assets/fink-logic.js')}</script>`);
swap('<script src="scrollcraft.js"></script>', `<script>${read('scrollcraft.js')}</script>`);
swap('<script src="site.js"></script>', `<script>${read('site.js')}</script>`);
html = html.replace('<!doctype html>', '<!DOCTYPE html>');

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
console.log(`dist/index.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
