function buildOpenRouterHeaders({
  apiKey,
  appTitle = 'DeputeGPT'
}) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Title': appTitle
  };

  const pageUrl = globalThis.location?.origin || globalThis.location?.href || '';
  if (/^https?:/i.test(pageUrl)) {
    headers['HTTP-Referer'] = pageUrl;
  }

  return headers;
}

function buildOpenRouterBody(modelConfig, messages, options = {}) {
  const body = {
    model: modelConfig.providerModelId,
    messages,
    stream: false
  };

  if (Number.isFinite(options.max_new_tokens)) {
    body.max_tokens = Math.max(1, Math.round(options.max_new_tokens));
  }

  if (Number.isFinite(options.temperature)) {
    body.temperature = options.temperature;
  }

  if (Number.isFinite(options.top_p)) {
    body.top_p = options.top_p;
  }

  if (Number.isFinite(options.top_k)) {
    body.top_k = options.top_k;
  }

  if (Number.isFinite(options.min_p)) {
    body.min_p = options.min_p;
  }

  if (Number.isFinite(options.repetition_penalty)) {
    body.repetition_penalty = options.repetition_penalty;
  }

  return body;
}

async function parseOpenRouterError(response) {
  let payload = null;

  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  const apiMessage = payload?.error?.message || payload?.message;
  if (apiMessage) {
    return apiMessage;
  }

  return `HTTP ${response.status}`;
}

export function createOpenRouterRuntime(
  modelConfig,
  {
    fetchImpl = globalThis.fetch,
    appTitle = 'DeputeGPT'
  } = {}
) {
  if (!modelConfig?.apiKey) {
    throw new Error('Cle API OpenRouter manquante.');
  }

  if (!modelConfig?.providerModelId) {
    throw new Error('Modele OpenRouter manquant.');
  }

  const endpointBase = String(modelConfig.apiBaseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');

  async function invoke(messages, options = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new Error('Fetch est indisponible dans ce navigateur.');
    }

    const response = await fetchImpl(`${endpointBase}/chat/completions`, {
      method: 'POST',
      headers: buildOpenRouterHeaders({
        apiKey: modelConfig.apiKey,
        appTitle
      }),
      body: JSON.stringify(buildOpenRouterBody(modelConfig, messages, options))
    });

    if (!response.ok) {
      throw new Error(await parseOpenRouterError(response));
    }

    return response.json();
  }

  return {
    invoke,
    async dispose() {
      return undefined;
    }
  };
}
