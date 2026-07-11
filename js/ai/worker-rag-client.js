import { createCircuitBreaker } from './circuit-breaker.js';

const RERANK_CACHE_LIMIT = 20;
const EMBED_CACHE_LIMIT = 10;
const MAX_RERANK_QUERY_LENGTH = 600;
const MAX_RERANK_DOCUMENT_LENGTH = 500;
const MAX_EMBED_INPUT_LENGTH = 800;
const DEFAULT_RERANK_TIMEOUT_MS = 2800;
const DEFAULT_EMBED_TIMEOUT_MS = 3000;

function readCache(cache, key) {
  if (!cache.has(key)) {
    return undefined;
  }
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function writeCache(cache, key, value, limit) {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  while (cache.size > limit) {
    cache.delete(cache.keys().next().value);
  }
}

/**
 * Client des routes RAG du Worker (/rerank, /embed-query).
 * Contrat : ne jette JAMAIS — toute erreur (timeout, quota, session, reseau)
 * retourne null et le classement local reprend silencieusement la main.
 */
export function createWorkerRagClient({
  getOnlineContext,
  fetchImpl = globalThis.fetch,
  now = () => Date.now()
} = {}) {
  const circuitBreaker = createCircuitBreaker(now);
  const disabledFeatures = new Set();
  const rerankCache = new Map();
  const embedCache = new Map();

  function resolveContext() {
    const context = typeof getOnlineContext === 'function' ? getOnlineContext() : null;
    const apiBaseUrl = String(context?.apiBaseUrl || '').trim().replace(/\/+$/, '');
    if (!apiBaseUrl || !context?.session) {
      return null;
    }
    return { apiBaseUrl, session: context.session };
  }

  function isFeatureAvailable(feature) {
    if (disabledFeatures.has(feature)) {
      return false;
    }

    const context = resolveContext();
    if (!context) {
      return false;
    }

    if (circuitBreaker.getStatus().status === 'open') {
      return false;
    }

    const capabilities = context.session.getCapabilities?.();
    if (!capabilities || capabilities[feature] !== true) {
      return false;
    }

    // Jamais de creation de session ici : le classement ne doit pas bloquer sur Turnstile.
    return Boolean(context.session.getCachedSessionToken?.());
  }

  async function postJson(context, path, body, timeoutMs, feature) {
    try {
      circuitBreaker.checkBeforeCall();
    } catch (error) {
      return null;
    }

    const sessionToken = context.session.getCachedSessionToken?.();
    if (!sessionToken) {
      return null;
    }

    let response;
    try {
      response = await fetchImpl(`${context.apiBaseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined
      });
    } catch (error) {
      circuitBreaker.recordFailure();
      return null;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      if (payload?.error_code === 'FEATURE_DISABLED') {
        disabledFeatures.add(feature);
      }
      if (response.status === 401 || response.status === 403) {
        context.session.clearSession?.();
      }
      // Un refus structure (quota, feature coupee) n'est pas une panne du Worker.
      if (response.status >= 500 && payload?.error_code !== 'FEATURE_DISABLED') {
        circuitBreaker.recordFailure();
      } else {
        circuitBreaker.recordSuccess();
      }
      return null;
    }

    circuitBreaker.recordSuccess();
    return payload;
  }

  async function rerank(question, documents, { topN = null, timeoutMs = DEFAULT_RERANK_TIMEOUT_MS, cacheKey = null } = {}) {
    if (!isFeatureAvailable('rerank')) {
      return null;
    }

    const query = String(question || '').trim().slice(0, MAX_RERANK_QUERY_LENGTH);
    const preparedDocuments = (Array.isArray(documents) ? documents : [])
      .map(doc => String(doc || '').trim().slice(0, MAX_RERANK_DOCUMENT_LENGTH) || 'scrutin');
    if (!query || preparedDocuments.length === 0) {
      return null;
    }

    if (cacheKey) {
      const cached = readCache(rerankCache, cacheKey);
      if (cached) {
        return new Map(cached);
      }
    }

    const context = resolveContext();
    if (!context) {
      return null;
    }

    const body = { query, documents: preparedDocuments };
    if (Number.isFinite(topN)) {
      body.top_n = Math.min(Math.max(1, Math.round(topN)), preparedDocuments.length);
    }

    const payload = await postJson(context, '/rerank', body, timeoutMs, 'rerank');
    const results = Array.isArray(payload?.results) ? payload.results : null;
    if (!results || results.length === 0) {
      return null;
    }

    const scores = new Map();
    results.forEach(entry => {
      const index = Number.parseInt(String(entry?.index ?? ''), 10);
      const score = Number(entry?.score);
      if (Number.isInteger(index) && index >= 0 && index < preparedDocuments.length && Number.isFinite(score)) {
        scores.set(index, score);
      }
    });

    if (scores.size === 0) {
      return null;
    }

    if (cacheKey) {
      writeCache(rerankCache, cacheKey, new Map(scores), RERANK_CACHE_LIMIT);
    }

    return scores;
  }

  async function embedQuery(input, { timeoutMs = DEFAULT_EMBED_TIMEOUT_MS } = {}) {
    if (!isFeatureAvailable('embed_query')) {
      return null;
    }

    const preparedInput = String(input || '').trim().slice(0, MAX_EMBED_INPUT_LENGTH);
    if (!preparedInput) {
      return null;
    }

    const cached = readCache(embedCache, preparedInput);
    if (cached) {
      return cached.slice();
    }

    const context = resolveContext();
    if (!context) {
      return null;
    }

    const payload = await postJson(context, '/embed-query', { input: preparedInput }, timeoutMs, 'embed_query');
    const embedding = Array.isArray(payload?.embedding) ? payload.embedding : null;
    if (!embedding || embedding.length === 0 || !embedding.every(Number.isFinite)) {
      return null;
    }

    writeCache(embedCache, preparedInput, embedding.slice(), EMBED_CACHE_LIMIT);
    return embedding;
  }

  return {
    isRerankAvailable() {
      return isFeatureAvailable('rerank');
    },
    isEmbedQueryAvailable() {
      return isFeatureAvailable('embed_query');
    },
    rerank,
    embedQuery,
    getCircuitStatus() {
      return circuitBreaker.getStatus();
    },
    resetCircuit() {
      circuitBreaker.reset();
      disabledFeatures.clear();
    }
  };
}
