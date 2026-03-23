async function fetchJsonDebug(url, fetchOptions = {}, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url, fetchOptions);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} sur ${url}. Debut de reponse: ${body.slice(0, 80)}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const body = await response.text();
    throw new Error(`Pas du JSON (${contentType}) sur ${url}. Debut: ${body.slice(0, 80)}`);
  }

  return response.json();
}

const DEFAULT_LATEST_PATH = 'public/data/deputes_actifs/latest.json';
const DEFAULT_BASE_PATH = 'public/data/deputes_actifs';

const deputesRepositoryCache = {
  latestPath: null,
  basePath: null,
  latest: null,
  latestPromise: null,
  bootLevel: null,
  bootData: null,
  bootPromise: null,
  detailedLevel: null,
  detailedData: null,
  detailedPromise: null
};

function resetRepositoryCacheInternal(latestPath, basePath) {
  if (
    deputesRepositoryCache.latestPath === latestPath &&
    deputesRepositoryCache.basePath === basePath
  ) {
    return;
  }

  deputesRepositoryCache.latestPath = latestPath;
  deputesRepositoryCache.basePath = basePath;
  deputesRepositoryCache.latest = null;
  deputesRepositoryCache.latestPromise = null;
  deputesRepositoryCache.bootLevel = null;
  deputesRepositoryCache.bootData = null;
  deputesRepositoryCache.bootPromise = null;
  deputesRepositoryCache.detailedLevel = null;
  deputesRepositoryCache.detailedData = null;
  deputesRepositoryCache.detailedPromise = null;
}

function buildDeputesAssetPathInternal(basePath, {
  explicitPath = null,
  fallbackPath = null
} = {}) {
  const rawPath = explicitPath || fallbackPath;
  if (!rawPath) {
    return null;
  }

  if (
    rawPath.startsWith('http://') ||
    rawPath.startsWith('https://') ||
    rawPath.startsWith('/')
  ) {
    return rawPath;
  }

  return `${basePath}/${rawPath}`;
}

async function resolveLatestInternal({
  latestPath = DEFAULT_LATEST_PATH,
  basePath = DEFAULT_BASE_PATH,
  fetchImpl = globalThis.fetch,
  forceRefresh = false
} = {}) {
  resetRepositoryCacheInternal(latestPath, basePath);

  if (!forceRefresh && deputesRepositoryCache.latest) {
    return deputesRepositoryCache.latest;
  }

  if (!forceRefresh && deputesRepositoryCache.latestPromise) {
    return deputesRepositoryCache.latestPromise;
  }

  deputesRepositoryCache.latestPromise = fetchJsonDebug(latestPath, { cache: 'no-store' }, fetchImpl)
    .then(latest => {
      deputesRepositoryCache.latest = latest;
      return latest;
    })
    .finally(() => {
      deputesRepositoryCache.latestPromise = null;
    });

  return deputesRepositoryCache.latestPromise;
}

export async function loadDeputesData({
  latestPath = DEFAULT_LATEST_PATH,
  basePath = DEFAULT_BASE_PATH,
  fetchImpl = globalThis.fetch
} = {}) {
  resetRepositoryCacheInternal(latestPath, basePath);

  if (deputesRepositoryCache.bootData) {
    return {
      latest: deputesRepositoryCache.latest,
      deputesData: deputesRepositoryCache.bootData,
      detailLevel: deputesRepositoryCache.bootLevel || 'boot'
    };
  }

  if (deputesRepositoryCache.bootPromise) {
    return deputesRepositoryCache.bootPromise;
  }

  deputesRepositoryCache.bootPromise = (async () => {
    const latest = await resolveLatestInternal({
      latestPath,
      basePath,
      fetchImpl
    });

    const bootPath = buildDeputesAssetPathInternal(basePath, {
      explicitPath: latest.boot_path,
      fallbackPath: `boot-${latest.version}.json`
    });
    const detailedPath = buildDeputesAssetPathInternal(basePath, {
      explicitPath: latest.detail_path,
      fallbackPath: `${latest.version}.json`
    });

    const candidateSources = [
      { path: bootPath, detailLevel: 'boot' },
      { path: detailedPath, detailLevel: 'full' }
    ].filter(candidate => Boolean(candidate.path));

    let lastError = null;
    for (const candidate of candidateSources) {
      try {
        const deputesData = await fetchJsonDebug(candidate.path, { cache: 'force-cache' }, fetchImpl);
        deputesRepositoryCache.latest = latest;
        deputesRepositoryCache.bootData = deputesData;
        deputesRepositoryCache.bootLevel = candidate.detailLevel;

        if (candidate.detailLevel === 'full') {
          deputesRepositoryCache.detailedData = deputesData;
          deputesRepositoryCache.detailedLevel = 'full';
        }

        return {
          latest,
          deputesData,
          detailLevel: candidate.detailLevel
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Impossible de charger les donnees deputes.');
  })().finally(() => {
    deputesRepositoryCache.bootPromise = null;
  });

  return deputesRepositoryCache.bootPromise;
}

export async function ensureDeputesDetailsReady({
  latestPath = DEFAULT_LATEST_PATH,
  basePath = DEFAULT_BASE_PATH,
  fetchImpl = globalThis.fetch
} = {}) {
  resetRepositoryCacheInternal(latestPath, basePath);

  if (deputesRepositoryCache.detailedData) {
    return {
      latest: deputesRepositoryCache.latest,
      deputesData: deputesRepositoryCache.detailedData,
      detailLevel: deputesRepositoryCache.detailedLevel || 'full'
    };
  }

  if (deputesRepositoryCache.detailedPromise) {
    return deputesRepositoryCache.detailedPromise;
  }

  deputesRepositoryCache.detailedPromise = (async () => {
    const latest = await resolveLatestInternal({
      latestPath,
      basePath,
      fetchImpl
    });
    const detailedPath = buildDeputesAssetPathInternal(basePath, {
      explicitPath: latest.detail_path,
      fallbackPath: `${latest.version}.json`
    });
    const deputesData = await fetchJsonDebug(detailedPath, { cache: 'force-cache' }, fetchImpl);

    deputesRepositoryCache.latest = latest;
    deputesRepositoryCache.detailedData = deputesData;
    deputesRepositoryCache.detailedLevel = 'full';

    return {
      latest,
      deputesData,
      detailLevel: 'full'
    };
  })().finally(() => {
    deputesRepositoryCache.detailedPromise = null;
  });

  return deputesRepositoryCache.detailedPromise;
}
