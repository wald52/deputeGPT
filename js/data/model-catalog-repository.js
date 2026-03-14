import { MODEL_CATALOG_PATH } from '../core/config.js';

export async function loadModelCatalog({
  path = MODEL_CATALOG_PATH,
  fallbackCatalog,
  fetchImpl = globalThis.fetch,
  logger = console
} = {}) {
  try {
    const response = await fetchImpl(path, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const catalog = await response.json();
    logger.log('📦 Catalogue charge depuis public/data/model-catalog.json');
    return {
      modelCatalog: catalog,
      modelsConfig: catalog.models || []
    };
  } catch (error) {
    logger.warn('⚠️ Impossible de charger model-catalog.json, fallback integre.', error);
    return {
      modelCatalog: fallbackCatalog,
      modelsConfig: fallbackCatalog?.models || []
    };
  }
}
