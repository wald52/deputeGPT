import {
  CHAT_HISTORY_DB_NAME,
  MANAGED_CACHE_PREFIXES,
  STORAGE_KEYS,
  STORAGE_KEY_PREFIX,
} from './config.js';

const MANAGED_STORAGE_KEYS = new Set(Object.values(STORAGE_KEYS));

function isManagedStorageKey(key) {
  return MANAGED_STORAGE_KEYS.has(key) || String(key || '').startsWith(STORAGE_KEY_PREFIX);
}

function isManagedCacheName(name) {
  const normalized = String(name || '').toLowerCase();
  return MANAGED_CACHE_PREFIXES.some(prefix => normalized.startsWith(String(prefix).toLowerCase()));
}

async function deleteManagedDatabases(indexedDbApi = globalThis.indexedDB) {
  if (!indexedDbApi || typeof indexedDbApi.databases !== 'function') {
    return [];
  }

  const deletedNames = [];
  const databases = await indexedDbApi.databases();
  const managedNames = databases
    .map(entry => entry?.name)
    .filter(name => name === CHAT_HISTORY_DB_NAME);

  await Promise.all(managedNames.map(name => new Promise(resolve => {
    const request = indexedDbApi.deleteDatabase(name);
    request.onsuccess = () => {
      deletedNames.push(name);
      resolve();
    };
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  })));

  return deletedNames;
}

async function deleteManagedCaches(cachesApi = globalThis.caches) {
  if (!cachesApi || typeof cachesApi.keys !== 'function') {
    return [];
  }

  const names = await cachesApi.keys();
  const deletedNames = [];
  for (const name of names) {
    if (!isManagedCacheName(name)) {
      continue;
    }
    const deleted = await cachesApi.delete(name);
    if (deleted) {
      deletedNames.push(name);
    }
  }
  return deletedNames;
}

function deleteManagedLocalStorage(localStorageApi = globalThis.localStorage) {
  if (!localStorageApi) {
    return [];
  }

  const deletedKeys = [];
  try {
    for (let index = localStorageApi.length - 1; index >= 0; index -= 1) {
      const key = localStorageApi.key(index);
      if (!isManagedStorageKey(key)) {
        continue;
      }
      localStorageApi.removeItem(key);
      deletedKeys.push(key);
    }
  } catch (error) {
    console.warn('Impossible de nettoyer le stockage local:', error);
  }
  return deletedKeys;
}

export function getStoredValue(key, localStorageApi = globalThis.localStorage) {
  try {
    return localStorageApi?.getItem(key) ?? null;
  } catch (error) {
    return null;
  }
}

export function setStoredValue(key, value, localStorageApi = globalThis.localStorage) {
  try {
    localStorageApi?.setItem(key, value);
  } catch (error) {
    console.warn('Stockage local indisponible:', error);
  }
}

export async function clearManagedAppStorage({
  indexedDbApi = globalThis.indexedDB,
  cachesApi = globalThis.caches,
  localStorageApi = globalThis.localStorage
} = {}) {
  const [deletedDatabases, deletedCaches] = await Promise.all([
    deleteManagedDatabases(indexedDbApi),
    deleteManagedCaches(cachesApi)
  ]);
  const deletedKeys = deleteManagedLocalStorage(localStorageApi);

  return {
    deletedDatabases,
    deletedCaches,
    deletedKeys
  };
}

export async function autoCleanStorage({
  storageApi = globalThis.navigator?.storage,
  indexedDbApi = globalThis.indexedDB,
  cachesApi = globalThis.caches,
  localStorageApi = globalThis.localStorage,
  confirmCleanup = message => globalThis.confirm?.(message),
  alertUser = message => globalThis.alert?.(message),
  reloadPage = () => globalThis.location?.reload()
} = {}) {
  if (!storageApi || typeof storageApi.estimate !== 'function') {
    return true;
  }

  const { usage = 0, quota = 0 } = await storageApi.estimate();
  if (!quota) {
    return true;
  }

  const percentUsed = (usage / quota) * 100;
  console.debug(`Stockage: ${(usage / 1024 / 1024).toFixed(0)}MB / ${(quota / 1024 / 1024).toFixed(0)}MB (${percentUsed.toFixed(1)}%)`);

  if (percentUsed > 100) {
    await clearManagedAppStorage({ indexedDbApi, cachesApi, localStorageApi });
    alertUser('Stockage sature detecte. Les donnees locales de DeputeGPT ont ete nettoyees et la page va se recharger.');
    reloadPage();
    return false;
  }

  if (percentUsed > 90) {
    const shouldClean = confirmCleanup(`Espace disque faible (${percentUsed.toFixed(0)}%).\n\nVoulez-vous nettoyer les donnees locales de DeputeGPT maintenant ?`);
    if (shouldClean) {
      await clearManagedAppStorage({ indexedDbApi, cachesApi, localStorageApi });
      alertUser('Donnees locales de DeputeGPT nettoyees.');
      reloadPage();
      return false;
    }
  }

  return true;
}
