#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'js', 'dist');
const LATEST_PATH = path.join(ROOT_DIR, 'public', 'data', 'deputes_actifs', 'latest.json');
const OUTPUT_PATH = path.join(ROOT_DIR, 'pwa-assets.json');
const SERVICE_WORKER_PATH = path.join(ROOT_DIR, 'sw.js');

const REQUIRED_ICON_ASSETS = [
  'public/icons/favicon-16x16.png',
  'public/icons/favicon-32x32.png',
  'public/icons/favicon-48x48.png',
  'public/icons/apple-touch-icon.png',
  'public/icons/icon-192.png',
  'public/icons/icon-512.png',
  'public/icons/icon-maskable-192.png',
  'public/icons/icon-maskable-512.png'
];

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
  } catch {
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

async function assertRequiredAssets(assetPaths) {
  const missingAssets = [];

  await Promise.all(
    assetPaths.map(async assetPath => {
      const filePath = path.join(ROOT_DIR, assetPath.replace(/\//g, path.sep));
      try {
        await fs.access(filePath);
      } catch {
        missingAssets.push(assetPath);
      }
    })
  );

  if (missingAssets.length > 0) {
    throw new Error(
      `Assets PWA manquants:\n- ${missingAssets.sort().join('\n- ')}\n` +
      `Regenerer les icones avant le build.`
    );
  }
}

async function computeVersion(assetPaths) {
  const hash = crypto.createHash('sha1');

  for (const assetPath of assetPaths) {
    const filePath = path.join(ROOT_DIR, assetPath.replace(/\//g, path.sep));
    hash.update(assetPath);

    try {
      hash.update(await fs.readFile(filePath));
    } catch {
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
  await assertRequiredAssets(REQUIRED_ICON_ASSETS);

  const distFiles = await listDistFiles();
  const latestMetadata = await readLatestMetadata();

  const precache = [
    './',
    'index.html',
    'manifest.webmanifest',
    'public/styles/app.css',
    ...REQUIRED_ICON_ASSETS,
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
