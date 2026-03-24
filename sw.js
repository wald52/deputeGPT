const PRECACHE_NAME = 'deputegpt-precache-v1';
const RUNTIME_CACHE_NAME = 'deputegpt-runtime-v1';
const NAVIGATION_CACHE_NAME = 'deputegpt-navigation-v1';
const CACHE_NAMES = [PRECACHE_NAME, RUNTIME_CACHE_NAME, NAVIGATION_CACHE_NAME];

const SCOPE_ROOT_URL = new URL('./', self.location).toString();
const INDEX_FALLBACK_URL = new URL('./index.html', self.location).toString();
const ASSET_MANIFEST_URL = new URL('./pwa-assets.json', self.location).toString();

let assetManifestPromise = null;
let assetManifestState = {
  version: 'fallback',
  precache: [SCOPE_ROOT_URL, INDEX_FALLBACK_URL],
  runtimeWarmup: []
};

function normalizeAssetList(urls = []) {
  return urls
    .filter(Boolean)
    .map(rawUrl => new URL(rawUrl, SCOPE_ROOT_URL).toString());
}

async function loadAssetManifest({ forceRefresh = false } = {}) {
  if (!forceRefresh && assetManifestPromise) {
    return assetManifestPromise;
  }

  assetManifestPromise = fetch(ASSET_MANIFEST_URL, { cache: 'no-store' })
    .then(async response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      assetManifestState = {
        version: payload?.version || 'fallback',
        precache: normalizeAssetList(payload?.precache || []),
        runtimeWarmup: normalizeAssetList(payload?.runtimeWarmup || [])
      };

      if (!assetManifestState.precache.includes(SCOPE_ROOT_URL)) {
        assetManifestState.precache.unshift(SCOPE_ROOT_URL);
      }

      if (!assetManifestState.precache.includes(INDEX_FALLBACK_URL)) {
        assetManifestState.precache.push(INDEX_FALLBACK_URL);
      }

      return assetManifestState;
    })
    .catch(() => assetManifestState);

  return assetManifestPromise;
}

async function syncPrecache(urls) {
  const cache = await caches.open(PRECACHE_NAME);
  const expectedUrls = new Set(urls);
  const cachedRequests = await cache.keys();

  await Promise.all(
    cachedRequests.map(request => {
      if (!expectedUrls.has(request.url)) {
        return cache.delete(request);
      }
      return Promise.resolve();
    })
  );

  await Promise.all(
    urls.map(async url => {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        await cache.put(url, response);
      }
    })
  );
}

async function warmRuntime(urls) {
  const cache = await caches.open(RUNTIME_CACHE_NAME);

  await Promise.allSettled(
    urls.map(async url => {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        await cache.put(url, response);
      }
    })
  );
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  await Promise.all(clients.map(client => client.postMessage(message)));
}

async function cleanupCaches() {
  const cacheKeys = await caches.keys();
  await Promise.all(
    cacheKeys.map(cacheName => {
      if (!CACHE_NAMES.includes(cacheName)) {
        return caches.delete(cacheName);
      }
      return Promise.resolve();
    })
  );
}

function isExcludedHeavyPath(pathname) {
  return (
    pathname.includes('/public/data/votes/') ||
    pathname.includes('/public/data/rag/') ||
    pathname.includes('/public/data/deputes_photos/') ||
    pathname.endsWith('/public/data/search_index.json') ||
    /\.(?:onnx|bin|safetensors)$/i.test(pathname)
  );
}

function isRuntimeBootstrapPath(pathname) {
  return (
    pathname.endsWith('/public/data/model-catalog.json') ||
    pathname.endsWith('/public/data/deputes_actifs/latest.json') ||
    pathname.endsWith('/public/data/deputes_actifs/groupes.json') ||
    /\/public\/data\/deputes_actifs\/boot-v\d{4}-\d{2}-\d{2}\.json$/i.test(pathname) ||
    pathname.endsWith('/public/data/hemicycle_svg/hemicycle.svg')
  );
}

async function matchPrecache(request) {
  const cache = await caches.open(PRECACHE_NAME);
  return cache.match(request, { ignoreSearch: false });
}

async function handleNavigation(request) {
  const cache = await caches.open(NAVIGATION_CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const navigationMatch = await cache.match(request, { ignoreSearch: true });
    if (navigationMatch) {
      return navigationMatch;
    }

    const scopeMatch = await cache.match(SCOPE_ROOT_URL);
    if (scopeMatch) {
      return scopeMatch;
    }

    const precache = await caches.open(PRECACHE_NAME);
    const precacheScopeMatch = await precache.match(SCOPE_ROOT_URL);
    if (precacheScopeMatch) {
      return precacheScopeMatch;
    }

    const precacheIndexMatch = await precache.match(INDEX_FALLBACK_URL);
    return precacheIndexMatch || Response.error();
  }
}

async function handleRuntimeRequest(request) {
  const cache = await caches.open(RUNTIME_CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request, { ignoreSearch: false });
    return cachedResponse || Response.error();
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const assetManifest = await loadAssetManifest({ forceRefresh: true });
    await syncPrecache(assetManifest.precache);
    await warmRuntime(assetManifest.runtimeWarmup);

    const existingClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    if (existingClients.length > 0 && self.registration.active) {
      await notifyClients({
        type: 'PWA_UPDATE_READY',
        version: assetManifest.version
      });
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await cleanupCaches();
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (isExcludedHeavyPath(url.pathname)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith((async () => {
    const precachedResponse = await matchPrecache(request);
    if (precachedResponse) {
      return precachedResponse;
    }

    if (isRuntimeBootstrapPath(url.pathname)) {
      return handleRuntimeRequest(request);
    }

    return fetch(request);
  })());
});
