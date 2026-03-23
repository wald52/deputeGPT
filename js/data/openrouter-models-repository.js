const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';
const PROVIDER_LABEL_OVERRIDES = {
  'ai21': 'AI21',
  'meta-llama': 'Meta Llama',
  'openai': 'OpenAI',
  'openrouter': 'OpenRouter',
  'x-ai': 'xAI'
};

const KNOWN_DEFAULT_PARAMETER_KEYS = [
  'temperature',
  'top_p',
  'top_k',
  'frequency_penalty',
  'presence_penalty',
  'repetition_penalty',
  'min_p',
  'top_a',
  'seed',
  'max_tokens',
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
];

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePricing(rawPricing = {}) {
  const pricing = {};

  Object.entries(rawPricing || {}).forEach(([key, value]) => {
    const parsed = parseNumber(value);
    pricing[key] = parsed;
  });

  return pricing;
}

function hasPositivePricingValue(pricing = {}) {
  return Object.values(pricing).some(value => Number.isFinite(value) && value > 0);
}

function hasVariablePricingValue(pricing = {}) {
  return Object.values(pricing).some(value => Number.isFinite(value) && value < 0);
}

function isFreePricing(pricing = {}) {
  const prompt = pricing.prompt;
  const completion = pricing.completion;
  const request = pricing.request;

  return [prompt, completion, request]
    .filter(value => value !== null && value !== undefined)
    .every(value => Number.isFinite(value) && value === 0);
}

function deriveProviderGroup(modelId = '') {
  const [providerGroup] = String(modelId || '').split('/');
  return providerGroup || 'other';
}

function deriveProviderLabel(rawModel) {
  const modelName = String(rawModel?.name || '').trim();
  const colonIndex = modelName.indexOf(':');
  if (colonIndex > 0) {
    return modelName.slice(0, colonIndex).trim();
  }

  const providerGroup = deriveProviderGroup(rawModel?.id);
  if (PROVIDER_LABEL_OVERRIDES[providerGroup]) {
    return PROVIDER_LABEL_OVERRIDES[providerGroup];
  }

  return providerGroup
    .split(/[-_]+/)
    .filter(Boolean)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function normalizeSupportedParameters(rawParameters) {
  if (!Array.isArray(rawParameters)) {
    return [];
  }

  return Array.from(
    new Set(
      rawParameters
        .map(value => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

function normalizeDefaultParameters(rawDefaults = {}, supportedParameters = []) {
  if (!rawDefaults || typeof rawDefaults !== 'object' || Array.isArray(rawDefaults)) {
    return {};
  }

  const supportedSet = new Set(supportedParameters);
  const normalized = {};

  KNOWN_DEFAULT_PARAMETER_KEYS.forEach(key => {
    if (!supportedSet.has(key) && !(key in rawDefaults)) {
      return;
    }

    const rawValue = rawDefaults[key];
    if (rawValue === null || rawValue === undefined) {
      return;
    }

    if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      normalized[key] = rawValue;
      return;
    }

    if (typeof rawValue === 'string') {
      normalized[key] = rawValue;
      return;
    }

    if (typeof rawValue === 'object') {
      normalized[key] = rawValue;
    }
  });

  return normalized;
}

function deriveStatus(rawModel) {
  const haystack = [
    rawModel?.id,
    rawModel?.canonical_slug,
    rawModel?.name,
    rawModel?.description
  ]
    .filter(Boolean)
    .join(' ');

  return /(alpha|beta|preview|experimental)/i.test(haystack)
    ? 'experimental'
    : 'stable';
}

export function normalizeOpenRouterModel(rawModel) {
  const id = String(rawModel?.id || '').trim();
  if (!id) {
    return null;
  }

  const pricing = normalizePricing(rawModel?.pricing);
  const supportedParameters = normalizeSupportedParameters(rawModel?.supported_parameters);
  const defaultParameters = normalizeDefaultParameters(rawModel?.default_parameters, supportedParameters);
  const providerGroup = deriveProviderGroup(id);
  const providerLabel = deriveProviderLabel(rawModel);
  const contextLength = parseNumber(rawModel?.context_length ?? rawModel?.top_provider?.context_length);
  const maxCompletionTokens = parseNumber(rawModel?.top_provider?.max_completion_tokens);
  const notes = String(rawModel?.description || '')
    .replace(/\s+/g, ' ')
    .trim();
  const isFree = isFreePricing(pricing);
  const priceStatus = hasVariablePricingValue(pricing)
    ? 'variable'
    : isFree
      ? 'free'
      : hasPositivePricingValue(pricing)
        ? 'paid'
        : 'unknown';

  return {
    id,
    name: String(rawModel?.name || id),
    providerModelId: id,
    providerGroup,
    providerLabel,
    pricing,
    isFree,
    priceStatus,
    contextLength,
    maxCompletionTokens,
    supportedParameters,
    defaultParameters,
    status: deriveStatus(rawModel),
    notes: notes || 'Modele OpenRouter distant.',
    searchText: [
      id,
      rawModel?.name,
      providerLabel,
      providerGroup
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  };
}

function compareOpenRouterModels(leftModel, rightModel) {
  return (
    leftModel.providerGroup.localeCompare(rightModel.providerGroup) ||
    leftModel.name.localeCompare(rightModel.name) ||
    leftModel.id.localeCompare(rightModel.id)
  );
}

export async function loadOpenRouterModels({
  fetchImpl = globalThis.fetch,
  endpoint = OPENROUTER_MODELS_ENDPOINT,
  signal
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch est indisponible dans ce navigateur.');
  }

  const response = await fetchImpl(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    },
    signal
  });

  if (!response.ok) {
    throw new Error(`Catalogue OpenRouter indisponible (HTTP ${response.status}).`);
  }

  const payload = await response.json();
  const models = Array.isArray(payload?.data)
    ? payload.data.map(normalizeOpenRouterModel).filter(Boolean).sort(compareOpenRouterModels)
    : [];

  if (models.length === 0) {
    throw new Error('OpenRouter ne renvoie aucun modele exploitable.');
  }

  return models;
}
