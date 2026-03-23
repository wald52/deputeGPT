#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT_DIR, 'index.html');
const TEMP_LIGHTHOUSE_INDEX_PATH = path.join(ROOT_DIR, 'tmp-lighthouse-index.html');

function parseArgs(argv) {
  const options = {
    url: 'http://127.0.0.1:8000/',
    output: path.join(ROOT_DIR, 'tmp-lighthouse-ci.json'),
    minPerformance: 90,
    maxLcp: 3000,
    useBundledEntry: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

    if (arg === '--url' && nextValue) {
      options.url = nextValue;
      index += 1;
      continue;
    }

    if (arg === '--output' && nextValue) {
      options.output = path.resolve(ROOT_DIR, nextValue);
      index += 1;
      continue;
    }

    if (arg === '--min-performance' && nextValue) {
      options.minPerformance = Number(nextValue);
      index += 1;
      continue;
    }

    if (arg === '--max-lcp' && nextValue) {
      options.maxLcp = Number(nextValue);
      index += 1;
      continue;
    }

    if (arg === '--use-bundled-entry') {
      options.useBundledEntry = true;
    }
  }

  return options;
}

async function writeBundledIndex() {
  const indexHtml = await fs.readFile(INDEX_PATH, 'utf8');
  const bundledHtml = indexHtml.replace(
    '<script type="module" src="js/app.js"></script>',
    '<script type="module" src="js/dist/app.js"></script>'
  );

  await fs.writeFile(TEMP_LIGHTHOUSE_INDEX_PATH, bundledHtml, 'utf8');
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  let chrome;

  try {
    if (options.useBundledEntry) {
      await writeBundledIndex();
    }

    const lighthouseModule = await import('lighthouse');
    const chromeLauncherModule = await import('chrome-launcher');
    const lighthouse = lighthouseModule.default ?? lighthouseModule;
    const { launch } = chromeLauncherModule;
    const chromePath = chromium.executablePath();

    chrome = await launch({
      chromePath,
      chromeFlags: [
        '--headless',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const runnerResult = await lighthouse(options.url, {
      port: chrome.port,
      logLevel: 'error',
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    });

    if (!runnerResult?.lhr) {
      throw new Error('Lighthouse ne renvoie aucun rapport exploitable.');
    }

    await fs.writeFile(options.output, runnerResult.report, 'utf8');

    const { lhr } = runnerResult;
    const performanceScore = Math.round((lhr.categories.performance?.score || 0) * 100);
    const accessibilityScore = Math.round((lhr.categories.accessibility?.score || 0) * 100);
    const lcpValue = Number(lhr.audits['largest-contentful-paint']?.numericValue || Number.NaN);
    const lcpSeconds = Number.isFinite(lcpValue) ? (lcpValue / 1000).toFixed(2) : 'n/a';

    console.log(`Performance: ${performanceScore}`);
    console.log(`Accessibility: ${accessibilityScore}`);
    console.log(`LCP: ${lcpSeconds}s`);
    console.log(`Rapport JSON: ${options.output}`);

    const failures = [];
    if (performanceScore < options.minPerformance) {
      failures.push(`Performance ${performanceScore} < seuil ${options.minPerformance}`);
    }
    if (Number.isFinite(lcpValue) && lcpValue > options.maxLcp) {
      failures.push(`LCP ${Math.round(lcpValue)}ms > seuil ${options.maxLcp}ms`);
    }

    if (failures.length > 0) {
      throw new Error(failures.join(' | '));
    }
  } finally {
    if (chrome) {
      try {
        await chrome.kill();
      } catch (cleanupError) {
        if (cleanupError?.code !== 'ENOENT' && cleanupError?.code !== 'EPERM') {
          throw cleanupError;
        }
      }
    }

    if (options.useBundledEntry) {
      try {
        await fs.rm(TEMP_LIGHTHOUSE_INDEX_PATH, { force: true });
      } catch (cleanupError) {
        if (cleanupError?.code !== 'ENOENT' && cleanupError?.code !== 'EPERM') {
          throw cleanupError;
        }
      }
    }
  }
}

run().catch(error => {
  console.error(error?.message || error);
  process.exit(1);
});
