import {
  DEFAULT_NON_THINKING_GENERATION,
  DEFAULT_THINKING_GENERATION,
} from '../core/config.js';

export function getModelGenerationPreset(modelConfig, thinkingEnabled = false) {
  if (!modelConfig || typeof modelConfig !== 'object') {
    return {};
  }

  const preset = thinkingEnabled ? modelConfig.thinking : modelConfig.non_thinking;
  if (!preset || typeof preset !== 'object') {
    return {};
  }

  return preset;
}

function hasNumericValue(value) {
  return Number.isFinite(value);
}

export function resolveGenerationOptions(modelConfig, options = {}, defaults = {}) {
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
