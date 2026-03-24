#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ICONS_DIR = path.join(ROOT_DIR, 'public', 'icons');
const DIST_DIR = path.join(ROOT_DIR, 'js', 'dist');
const LATEST_PATH = path.join(ROOT_DIR, 'public', 'data', 'deputes_actifs', 'latest.json');
const OUTPUT_PATH = path.join(ROOT_DIR, 'pwa-assets.json');
const SERVICE_WORKER_PATH = path.join(ROOT_DIR, 'sw.js');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const ICON_SPECS = [
  { fileName: 'icon-192.png', size: 192, maskable: false },
  { fileName: 'icon-512.png', size: 512, maskable: false },
  { fileName: 'icon-maskable-192.png', size: 192, maskable: true },
  { fileName: 'icon-maskable-512.png', size: 512, maskable: true },
  { fileName: 'apple-touch-icon.png', size: 180, maskable: false }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBuffer, data]);
  const chunk = Buffer.alloc(12 + data.length);

  chunk.writeUInt32BE(data.length, 0);
  payload.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(payload), 8 + data.length);
  return chunk;
}

function encodePng(width, height, rgbaBuffer) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgbaBuffer.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', deflateSync(raw, { level: 9 })),
    createChunk('IEND', Buffer.alloc(0))
  ]);
}

function setPixel(buffer, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }

  const offset = (y * size + x) * 4;
  buffer[offset] = color[0];
  buffer[offset + 1] = color[1];
  buffer[offset + 2] = color[2];
  buffer[offset + 3] = color[3];
}

function fillRect(buffer, size, x, y, width, height, color) {
  const startX = Math.floor(clamp(x, 0, size));
  const startY = Math.floor(clamp(y, 0, size));
  const endX = Math.ceil(clamp(x + width, 0, size));
  const endY = Math.ceil(clamp(y + height, 0, size));

  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      setPixel(buffer, size, px, py, color);
    }
  }
}

function fillRoundedRect(buffer, size, x, y, width, height, radius, color) {
  const endX = x + width;
  const endY = y + height;
  const limit = radius * radius;

  for (let py = Math.floor(y); py < Math.ceil(endY); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(endX); px += 1) {
      let inside = true;

      if (px < x + radius && py < y + radius) {
        inside = ((px - (x + radius)) ** 2) + ((py - (y + radius)) ** 2) <= limit;
      } else if (px > endX - radius && py < y + radius) {
        inside = ((px - (endX - radius)) ** 2) + ((py - (y + radius)) ** 2) <= limit;
      } else if (px < x + radius && py > endY - radius) {
        inside = ((px - (x + radius)) ** 2) + ((py - (endY - radius)) ** 2) <= limit;
      } else if (px > endX - radius && py > endY - radius) {
        inside = ((px - (endX - radius)) ** 2) + ((py - (endY - radius)) ** 2) <= limit;
      }

      if (inside) {
        setPixel(buffer, size, px, py, color);
      }
    }
  }
}

function fillCircle(buffer, size, centerX, centerY, radius, color) {
  const limit = radius * radius;
  for (let py = Math.floor(centerY - radius); py <= Math.ceil(centerY + radius); py += 1) {
    for (let px = Math.floor(centerX - radius); px <= Math.ceil(centerX + radius); px += 1) {
      if (((px - centerX) ** 2) + ((py - centerY) ** 2) <= limit) {
        setPixel(buffer, size, px, py, color);
      }
    }
  }
}

function drawIcon(size, { maskable = false } = {}) {
  const buffer = Buffer.alloc(size * size * 4);
  const topColor = [247, 242, 232, 255];
  const bottomColor = [230, 221, 205, 255];
  const highlightColor = [255, 255, 255, 52];
  const bodyColor = [21, 63, 114, 255];
  const shadowColor = [13, 44, 81, 255];
  const accentColor = [166, 67, 62, 255];
  const paperColor = [252, 248, 241, 255];

  for (let y = 0; y < size; y += 1) {
    const ratio = y / Math.max(size - 1, 1);
    const red = Math.round(topColor[0] + ((bottomColor[0] - topColor[0]) * ratio));
    const green = Math.round(topColor[1] + ((bottomColor[1] - topColor[1]) * ratio));
    const blue = Math.round(topColor[2] + ((bottomColor[2] - topColor[2]) * ratio));
    fillRect(buffer, size, 0, y, size, 1, [red, green, blue, 255]);
  }

  const margin = maskable ? size * 0.09 : size * 0.17;
  const cardSize = size - (margin * 2);
  const cardX = margin;
  const cardY = margin + (size * 0.03);
  const cardRadius = cardSize * 0.18;

  fillCircle(buffer, size, size * 0.26, size * 0.2, size * 0.21, highlightColor);
  fillRoundedRect(buffer, size, cardX, cardY + (size * 0.03), cardSize, cardSize, cardRadius, shadowColor);
  fillRoundedRect(buffer, size, cardX, cardY, cardSize, cardSize, cardRadius, bodyColor);

  fillRect(buffer, size, cardX, cardY, cardSize * 0.18, cardSize, accentColor);
  fillRect(buffer, size, cardX + (cardSize * 0.18), cardY, cardSize * 0.12, cardSize, [246, 236, 218, 255]);

  const docWidth = cardSize * 0.38;
  const docHeight = cardSize * 0.48;
  const docX = cardX + (cardSize * 0.42);
  const docY = cardY + (cardSize * 0.22);
  const docRadius = cardSize * 0.06;

  fillRoundedRect(buffer, size, docX, docY, docWidth, docHeight, docRadius, paperColor);
  fillRect(buffer, size, docX + (docWidth * 0.17), docY + (docHeight * 0.18), docWidth * 0.66, docHeight * 0.08, bodyColor);
  fillRect(buffer, size, docX + (docWidth * 0.17), docY + (docHeight * 0.4), docWidth * 0.66, docHeight * 0.08, accentColor);
  fillRect(buffer, size, docX + (docWidth * 0.17), docY + (docHeight * 0.62), docWidth * 0.42, docHeight * 0.08, bodyColor);

  return buffer;
}

function normalizeAssetPath(rawPath) {
  if (!rawPath) {
    return null;
  }

  if (/^https?:\/\//i.test(rawPath)) {
    return null;
  }

  const normalized = rawPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  return normalized || null;
}

async function readLatestMetadata() {
  try {
    const payload = JSON.parse(await fs.readFile(LATEST_PATH, 'utf8'));
    const bootPath = normalizeAssetPath(
      payload.boot_path || `public/data/deputes_actifs/boot-${payload.version}.json`
    );

    return {
      latestPath: 'public/data/deputes_actifs/latest.json',
      bootPath,
      groupesPath: 'public/data/deputes_actifs/groupes.json'
    };
  } catch (error) {
    return {
      latestPath: 'public/data/deputes_actifs/latest.json',
      bootPath: null,
      groupesPath: 'public/data/deputes_actifs/groupes.json'
    };
  }
}

async function listDistFiles() {
  const entries = await fs.readdir(DIST_DIR, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => `js/dist/${entry.name}`)
    .sort();
}

async function ensureIcons() {
  await fs.mkdir(ICONS_DIR, { recursive: true });

  await Promise.all(
    ICON_SPECS.map(async iconSpec => {
      const filePath = path.join(ICONS_DIR, iconSpec.fileName);
      const pngBuffer = encodePng(iconSpec.size, iconSpec.size, drawIcon(iconSpec.size, iconSpec));
      await fs.writeFile(filePath, pngBuffer);
    })
  );
}

async function computeVersion(assetPaths) {
  const hash = crypto.createHash('sha1');

  for (const assetPath of assetPaths) {
    const filePath = path.join(ROOT_DIR, assetPath.replace(/\//g, path.sep));
    hash.update(assetPath);

    try {
      hash.update(await fs.readFile(filePath));
    } catch (error) {
      hash.update('missing');
    }
  }

  return hash.digest('hex').slice(0, 12);
}

async function syncServiceWorkerVersion(version) {
  const source = await fs.readFile(SERVICE_WORKER_PATH, 'utf8');
  const pattern = /const SW_BUILD_VERSION = '[^']*';/;
  if (!pattern.test(source)) {
    throw new Error('Impossible de synchroniser la version du service worker.');
  }

  const nextSource = source.replace(
    pattern,
    `const SW_BUILD_VERSION = '${version}';`
  );

  await fs.writeFile(SERVICE_WORKER_PATH, nextSource, 'utf8');
}

async function run() {
  await ensureIcons();

  const distFiles = await listDistFiles();
  const latestMetadata = await readLatestMetadata();

  const precache = [
    './',
    'index.html',
    'manifest.webmanifest',
    'public/styles/app.css',
    'public/icons/icon-192.png',
    'public/icons/icon-512.png',
    'public/icons/icon-maskable-192.png',
    'public/icons/icon-maskable-512.png',
    'public/icons/apple-touch-icon.png',
    ...distFiles
  ];

  const runtimeWarmup = [
    'public/data/model-catalog.json',
    latestMetadata.latestPath,
    latestMetadata.bootPath,
    latestMetadata.groupesPath
  ].filter(Boolean);

  const version = await computeVersion([
    ...precache.filter(assetPath => assetPath !== './'),
    ...runtimeWarmup
  ]);

  const payload = {
    version,
    generatedAt: new Date().toISOString(),
    precache,
    runtimeWarmup
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await syncServiceWorkerVersion(version);
  console.log(`Manifeste PWA genere: ${OUTPUT_PATH}`);
}

run().catch(error => {
  console.error(error?.message || error);
  process.exit(1);
});
