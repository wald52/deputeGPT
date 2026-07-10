import { loadExternalScript } from '../core/external-script-loader.js';

export const SESSION_TOKEN_KEY = 'deputegpt:online-session-token';
export const SESSION_EXPIRY_KEY = 'deputegpt:online-session-expiry';
export const SESSION_CAPABILITIES_KEY = 'deputegpt:online-session-capabilities';
const TURNSTILE_API_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export function getStorageValue(key, storageApi = globalThis.sessionStorage) {
  try {
    return storageApi?.getItem(key) ?? null;
  } catch (error) {
    return null;
  }
}

export function setStorageValue(key, value, storageApi = globalThis.sessionStorage) {
  try {
    if (value === null || value === undefined || value === '') {
      storageApi?.removeItem(key);
      return;
    }

    storageApi?.setItem(key, value);
  } catch (error) {
    console.warn('Stockage de session indisponible pour l IA en ligne.', error);
  }
}

export function getCachedSessionToken(storageApi = globalThis.sessionStorage, now = () => Date.now()) {
  const storedToken = getStorageValue(SESSION_TOKEN_KEY, storageApi);
  const storedExpiry = getStorageValue(SESSION_EXPIRY_KEY, storageApi);
  const expiryMs = storedExpiry ? Date.parse(storedExpiry) : Number.NaN;
  const hasValidToken = storedToken
    && Number.isFinite(expiryMs)
    && expiryMs - now() > 30000;

  return hasValidToken ? storedToken : null;
}

export function getCachedCapabilities(storageApi = globalThis.sessionStorage) {
  const raw = getStorageValue(SESSION_CAPABILITIES_KEY, storageApi);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

export function clearStoredSession(storageApi = globalThis.sessionStorage) {
  setStorageValue(SESSION_TOKEN_KEY, null, storageApi);
  setStorageValue(SESSION_EXPIRY_KEY, null, storageApi);
}

async function parseSessionError(response) {
  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  const message = payload?.message || payload?.error || payload?.error_message || `HTTP ${response.status}`;
  const error = new Error(message);
  error.code = payload?.error_code || payload?.code || null;
  error.nextAction = payload?.next_action || null;
  error.responseStatus = response.status;
  return error;
}

export function createTurnstileTokenResolver({
  siteKey,
  documentRef = globalThis.document
}) {
  let widgetId = null;
  let renderPromise = null;
  let pendingTokenRequest = null;

  function ensureSlot() {
    if (!documentRef?.body) {
      return null;
    }

    let slot = documentRef.getElementById('online-turnstile-slot');
    if (slot) {
      return slot;
    }

    slot = documentRef.createElement('div');
    slot.id = 'online-turnstile-slot';
    slot.hidden = true;
    documentRef.body.appendChild(slot);
    return slot;
  }

  async function ensureTurnstileApi() {
    if (!siteKey) {
      return null;
    }

    if (globalThis.turnstile && typeof globalThis.turnstile.render === 'function') {
      return globalThis.turnstile;
    }

    const turnstileApi = await loadExternalScript(TURNSTILE_API_URL, {
      documentRef,
      globalName: 'turnstile'
    });
    return turnstileApi && typeof turnstileApi.render === 'function' ? turnstileApi : null;
  }

  async function ensureWidget() {
    const turnstileApi = await ensureTurnstileApi();
    if (!siteKey || !turnstileApi || typeof turnstileApi.render !== 'function') {
      return null;
    }

    if (widgetId !== null) {
      return widgetId;
    }

    if (renderPromise) {
      return renderPromise;
    }

    renderPromise = Promise.resolve().then(() => {
      const slot = ensureSlot();
      if (!slot) {
        return null;
      }

      widgetId = turnstileApi.render(slot, {
        sitekey: siteKey,
        size: 'invisible',
        appearance: 'interaction-only',
        execution: 'execute',
        callback(token) {
          pendingTokenRequest?.resolve(token || null);
          pendingTokenRequest = null;
        },
        'error-callback'() {
          pendingTokenRequest?.reject(new Error('Verification anti-abus echouee.'));
          pendingTokenRequest = null;
        },
        'expired-callback'() {
          pendingTokenRequest?.reject(new Error('Verification anti-abus expiree.'));
          pendingTokenRequest = null;
        }
      });

      return widgetId;
    });

    try {
      return await renderPromise;
    } finally {
      renderPromise = null;
    }
  }

  return async function resolveTurnstileToken() {
    const turnstileApi = await ensureTurnstileApi();
    const resolvedWidgetId = await ensureWidget();
    if (resolvedWidgetId === null || !turnstileApi || typeof turnstileApi.execute !== 'function') {
      return null;
    }

    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        pendingTokenRequest = null;
        reject(new Error('Turnstile indisponible.'));
      }, 15000);

      try {
        pendingTokenRequest = {
          resolve(token) {
            globalThis.clearTimeout(timeout);
            resolve(token);
          },
          reject(error) {
            globalThis.clearTimeout(timeout);
            reject(error);
          }
        };
        turnstileApi.reset(resolvedWidgetId);
        turnstileApi.execute(resolvedWidgetId);
      } catch (error) {
        globalThis.clearTimeout(timeout);
        pendingTokenRequest = null;
        reject(error);
      }
    });
  };
}

export function createOnlineSessionClient({
  apiBaseUrl,
  turnstileSiteKey = '',
  fetchImpl = globalThis.fetch,
  storageApi = globalThis.sessionStorage,
  now = () => Date.now(),
  circuitBreaker = null
} = {}) {
  const endpointBase = String(apiBaseUrl || '').trim().replace(/\/+$/, '');

  const resolveTurnstileToken = createTurnstileTokenResolver({
    siteKey: String(turnstileSiteKey || '').trim()
  });

  async function requestSessionToken() {
    circuitBreaker?.checkBeforeCall();
    try {
      const turnstileToken = await resolveTurnstileToken();
      const response = await fetchImpl(`${endpointBase}/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          turnstile_token: turnstileToken
        })
      });

      if (!response.ok) {
        throw await parseSessionError(response);
      }

      const payload = await response.json();
      const sessionToken = String(payload?.session_token || '').trim();
      const expiresAt = String(payload?.expires_at || '').trim();

      if (!sessionToken) {
        throw new Error('Le Worker IA en ligne ne renvoie aucun jeton de session.');
      }

      setStorageValue(SESSION_TOKEN_KEY, sessionToken, storageApi);
      setStorageValue(SESSION_EXPIRY_KEY, expiresAt, storageApi);
      if (payload?.capabilities && typeof payload.capabilities === 'object') {
        setStorageValue(SESSION_CAPABILITIES_KEY, JSON.stringify(payload.capabilities), storageApi);
      }
      circuitBreaker?.recordSuccess();
      return sessionToken;
    } catch (error) {
      if (error?.code !== 'CIRCUIT_OPEN') {
        circuitBreaker?.recordFailure();
      }
      throw error;
    }
  }

  async function ensureSessionToken() {
    return getCachedSessionToken(storageApi, now) || requestSessionToken();
  }

  return {
    ensureSessionToken,
    requestSessionToken,
    getCachedSessionToken() {
      return getCachedSessionToken(storageApi, now);
    },
    getCapabilities() {
      return getCachedCapabilities(storageApi);
    },
    clearSession() {
      clearStoredSession(storageApi);
    }
  };
}
