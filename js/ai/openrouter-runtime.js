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

  const maxTokens = Number.isFinite(options.max_tokens)
    ? options.max_tokens
    : Number.isFinite(options.max_new_tokens)
      ? options.max_new_tokens
      : null;

  if (Number.isFinite(maxTokens)) {
    body.max_tokens = Math.max(1, Math.round(maxTokens));
  }

  [
    'temperature',
    'top_p',
    'top_k',
    'frequency_penalty',
    'presence_penalty',
    'repetition_penalty',
    'min_p',
    'top_a',
    'seed',
    'logit_bias',
    'logprobs',
    'top_logprobs',
    'response_format',
    'structured_outputs',
    'stop',
    'tools',
    'tool_choice',
    'parallel_tool_calls',
    'verbosity'
  ].forEach(key => {
    const value = options[key];
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value === 'number' && !Number.isFinite(value)) {
      return;
    }

    body[key] = value;
  });

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
