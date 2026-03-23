import { loadExternalScript } from '../core/external-script-loader.js';

const SESSION_TOKEN_KEY = 'deputegpt:online-session-token';
const SESSION_EXPIRY_KEY = 'deputegpt:online-session-expiry';
const TURNSTILE_API_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function getStorageValue(key, storageApi = globalThis.sessionStorage) {
  try {
    return storageApi?.getItem(key) ?? null;
  } catch (error) {
    return null;
  }
}

function setStorageValue(key, value, storageApi = globalThis.sessionStorage) {
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

function buildOnlineRequestBody(messages, options = {}, metadata = {}) {
  const body = {
    messages,
    metadata
  };

  const maxTokens = Number.isFinite(options.max_tokens)
    ? options.max_tokens
    : Number.isFinite(options.max_new_tokens)
      ? options.max_new_tokens
      : null;

  if (Number.isFinite(maxTokens)) {
    body.max_tokens = Math.max(1, Math.round(maxTokens));
  }

  ['temperature', 'top_p', 'top_k'].forEach(key => {
    const value = options[key];
    if (Number.isFinite(value)) {
      body[key] = value;
    }
  });

  return body;
}

async function parseOnlineError(response) {
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
  error.provider = payload?.provider || null;
  error.route = payload?.route || null;
  error.fallbackCount = Number.isFinite(payload?.fallback_count) ? payload.fallback_count : 0;
  error.responseStatus = response.status;
  return error;
}

function createTurnstileTokenResolver({
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

export function createOnlineRuntime(
  modelConfig,
  {
    fetchImpl = globalThis.fetch,
    storageApi = globalThis.sessionStorage,
    now = () => Date.now()
  } = {}
) {
  const endpointBase = String(modelConfig?.apiBaseUrl || '').trim().replace(/\/+$/, '');
  if (!endpointBase) {
    throw new Error('Service IA en ligne non configure. Ajoutez l URL du Worker Cloudflare.');
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch est indisponible dans ce navigateur.');
  }

  const resolveTurnstileToken = createTurnstileTokenResolver({
    siteKey: String(modelConfig?.turnstileSiteKey || '').trim()
  });

  async function requestSessionToken() {
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
      throw await parseOnlineError(response);
    }

    const payload = await response.json();
    const sessionToken = String(payload?.session_token || '').trim();
    const expiresAt = String(payload?.expires_at || '').trim();

    if (!sessionToken) {
      throw new Error('Le Worker IA en ligne ne renvoie aucun jeton de session.');
    }

    setStorageValue(SESSION_TOKEN_KEY, sessionToken, storageApi);
    setStorageValue(SESSION_EXPIRY_KEY, expiresAt, storageApi);
    return sessionToken;
  }

  async function ensureSessionToken() {
    const storedToken = getStorageValue(SESSION_TOKEN_KEY, storageApi);
    const storedExpiry = getStorageValue(SESSION_EXPIRY_KEY, storageApi);
    const expiryMs = storedExpiry ? Date.parse(storedExpiry) : Number.NaN;
    const hasValidToken = storedToken
      && Number.isFinite(expiryMs)
      && expiryMs - now() > 30000;

    if (hasValidToken) {
      return storedToken;
    }

    return requestSessionToken();
  }

  async function invoke(messages, options = {}) {
    const sessionToken = await ensureSessionToken();
    const response = await fetchImpl(`${endpointBase}/analysis`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildOnlineRequestBody(messages, options, {
        source: 'deputegpt-web',
        model_signature: modelConfig?.signature || null
      }))
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        setStorageValue(SESSION_TOKEN_KEY, null, storageApi);
        setStorageValue(SESSION_EXPIRY_KEY, null, storageApi);
      }

      throw await parseOnlineError(response);
    }

    const payload = await response.json();
    return {
      choices: [
        {
          message: {
            content: payload?.answer || ''
          }
        }
      ],
      deputeGPTMeta: payload
    };
  }

  return {
    invoke,
    async dispose() {
      return undefined;
    }
  };
}
