import {
  DEFAULT_NON_THINKING_GENERATION,
  DEFAULT_THINKING_GENERATION,
} from '../core/config.js';

export const OPENROUTER_PARAMETER_KEYS = [
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

export const OPENROUTER_INACTIVE_PARAMETER_KEYS = new Set([
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
]);

const OPENROUTER_REMOTE_ANALYSIS_DEFAULTS = {
  temperature: 0.2,
  top_p: 0.9
};

function hasNumericValue(value) {
  return Number.isFinite(value);
}

function hasDefinedValue(value) {
  return value !== null && value !== undefined;
}

function hasOwnValue(source, key) {
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key) && hasDefinedValue(source[key]);
}

function getModelGenerationPreset(modelConfig, thinkingEnabled = false) {
  if (!modelConfig || typeof modelConfig !== 'object') {
    return {};
  }

  const preset = thinkingEnabled ? modelConfig.thinking : modelConfig.non_thinking;
  if (!preset || typeof preset !== 'object') {
    return {};
  }

  return preset;
}

function resolveOpenRouterGenerationOptions(modelConfig, options = {}, defaults = {}) {
  const supportedParameters = new Set(Array.isArray(modelConfig?.supportedParameters) ? modelConfig.supportedParameters : []);
  const providerDefaults = modelConfig?.defaultParameters || {};
  const generationOptions = {};

  const requestedMaxTokens = hasNumericValue(options.max_tokens)
    ? options.max_tokens
    : hasNumericValue(options.max_new_tokens)
      ? options.max_new_tokens
      : hasNumericValue(defaults.max_tokens)
        ? defaults.max_tokens
        : hasNumericValue(defaults.max_new_tokens)
          ? defaults.max_new_tokens
          : null;

  if (supportedParameters.has('max_tokens') && hasNumericValue(requestedMaxTokens)) {
    const providerCap = hasNumericValue(modelConfig?.maxCompletionTokens)
      ? modelConfig.maxCompletionTokens
      : null;
    const effectiveMaxTokens = providerCap !== null
      ? Math.min(requestedMaxTokens, providerCap)
      : requestedMaxTokens;

    generationOptions.max_tokens = Math.max(1, Math.round(effectiveMaxTokens));
    generationOptions.max_new_tokens = generationOptions.max_tokens;
  }

  [
    ['temperature', OPENROUTER_REMOTE_ANALYSIS_DEFAULTS.temperature],
    ['top_p', OPENROUTER_REMOTE_ANALYSIS_DEFAULTS.top_p],
    ['top_k', null]
  ].forEach(([key, fallbackValue]) => {
    if (!supportedParameters.has(key)) {
      return;
    }

    const resolvedValue = hasOwnValue(options, key)
      ? options[key]
      : hasOwnValue(providerDefaults, key)
        ? providerDefaults[key]
        : hasOwnValue(defaults, key)
          ? defaults[key]
          : fallbackValue;

    if (hasNumericValue(resolvedValue)) {
      generationOptions[key] = resolvedValue;
    }
  });

  OPENROUTER_PARAMETER_KEYS
    .filter(key => !['temperature', 'top_p', 'top_k', 'max_tokens'].includes(key))
    .forEach(key => {
      if (!supportedParameters.has(key)) {
        return;
      }

      const explicitValue = hasOwnValue(options, key)
        ? options[key]
        : hasOwnValue(defaults, key)
          ? defaults[key]
          : undefined;

      if (!hasDefinedValue(explicitValue)) {
        return;
      }

      if (OPENROUTER_INACTIVE_PARAMETER_KEYS.has(key) || hasOwnValue(providerDefaults, key)) {
        generationOptions[key] = explicitValue;
      }
    });

  return generationOptions;
}

export function resolveGenerationOptions(modelConfig, options = {}, defaults = {}) {
  if (
    modelConfig?.provider === 'openrouter'
    || modelConfig?.runtime === 'openrouter_remote'
    || modelConfig?.provider === 'online'
    || modelConfig?.runtime === 'online_remote'
  ) {
    return resolveOpenRouterGenerationOptions(modelConfig, options, defaults);
  }

  const thinkingEnabled = Boolean(options.enable_thinking);
  const preset = getModelGenerationPreset(modelConfig, thinkingEnabled);
  const baseDefaults = thinkingEnabled ? DEFAULT_THINKING_GENERATION : DEFAULT_NON_THINKING_GENERATION;
  const merged = {
    ...baseDefaults,
    ...preset,
    ...defaults,
    ...options
  };

  const generationOptions = {};

  if (hasNumericValue(merged.max_new_tokens)) {
    generationOptions.max_new_tokens = merged.max_new_tokens;
  }

  if (hasNumericValue(merged.temperature)) {
    generationOptions.temperature = merged.temperature;
  }

  if (hasNumericValue(merged.top_p)) {
    generationOptions.top_p = merged.top_p;
  }

  if (hasNumericValue(merged.top_k)) {
    generationOptions.top_k = merged.top_k;
  }

  if (hasNumericValue(merged.min_p)) {
    generationOptions.min_p = merged.min_p;
  }

  if (hasNumericValue(merged.repetition_penalty)) {
    generationOptions.repetition_penalty = merged.repetition_penalty;
  }

  if (typeof merged.do_sample === 'boolean') {
    generationOptions.do_sample = merged.do_sample;
  } else if (hasNumericValue(merged.temperature)) {
    generationOptions.do_sample = merged.temperature > 0;
  } else {
    generationOptions.do_sample = true;
  }

  return generationOptions;
}
