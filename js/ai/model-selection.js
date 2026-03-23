import {
  OPENROUTER_PARAMETER_KEYS
} from './generation-options.js';

const LOCAL_SOURCE_ID = 'local';
const ONLINE_SOURCE_ID = 'online';
const LEGACY_OPENROUTER_SOURCE_ID = 'openrouter';
const OPENROUTER_SOURCE_ID = ONLINE_SOURCE_ID;
const OPENROUTER_DEFAULT_MODEL_ID = 'online/default';
const OPENROUTER_FALLBACK_MODEL_ID = 'online/fallback';
const OPENROUTER_FILTER_IDS = new Set(['all', 'free', 'paid']);

const DEFAULT_THINKING_HELP_TEXT = 'Plus lent, reserve aux usages avances. Le raisonnement interne reste masque dans l interface.';
const REMOTE_THINKING_INFO_TITLE = 'Sortie finale uniquement';
const REMOTE_THINKING_INFO_TEXT = 'Le service IA en ligne n envoie qu un contexte court pour les analyses, puis renvoie uniquement la reponse finale. L interface masque toujours le raisonnement interne.';

const OPENROUTER_PARAMETER_LABELS = {
  temperature: 'temperature',
  top_p: 'top_p',
  top_k: 'top_k',
  frequency_penalty: 'frequency_penalty',
  presence_penalty: 'presence_penalty',
  repetition_penalty: 'repetition_penalty',
  min_p: 'min_p',
  top_a: 'top_a',
  seed: 'seed',
  max_tokens: 'max_tokens',
  logit_bias: 'logit_bias',
  logprobs: 'logprobs',
  top_logprobs: 'top_logprobs',
  response_format: 'response_format',
  structured_outputs: 'structured_outputs',
  stop: 'stop',
  tools: 'tools',
  tool_choice: 'tool_choice',
  parallel_tool_calls: 'parallel_tool_calls',
  verbosity: 'verbosity'
};

function formatIntegerLabel(value) {
  return Number.isFinite(value)
    ? Math.round(value).toLocaleString('fr-FR')
    : 'Inconnu';
}

function formatUsdPerMillion(rawValue) {
  if (!Number.isFinite(rawValue)) {
    return null;
  }

  const perMillion = rawValue * 1000000;
  const digits = perMillion < 1 ? 3 : perMillion < 10 ? 2 : 1;
  return `${perMillion.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  })} $/1M`;
}

function formatUsdFlat(rawValue) {
  if (!Number.isFinite(rawValue)) {
    return null;
  }

  const digits = rawValue < 1 ? 3 : rawValue < 10 ? 2 : 1;
  return `${rawValue.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  })} $/req`;
}

function buildOpenRouterPricingSummary(modelConfig) {
  const pricing = modelConfig?.pricing || {};
  const promptLabel = formatUsdPerMillion(pricing.prompt);
  const completionLabel = formatUsdPerMillion(pricing.completion);
  const requestLabel = formatUsdFlat(pricing.request);

  if (modelConfig?.priceStatus === 'free') {
    return 'Quotas gratuits mutualises cote service';
  }

  if (modelConfig?.priceStatus === 'variable') {
    return 'Routage dynamique selon disponibilite';
  }

  const parts = [];
  if (promptLabel) {
    parts.push(`prompt ${promptLabel}`);
  }
  if (completionLabel) {
    parts.push(`completion ${completionLabel}`);
  }
  if (requestLabel) {
    parts.push(`requete ${requestLabel}`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'Tarif indisponible';
}

function buildOpenRouterPriceBadge(modelConfig) {
  const priceStatus = modelConfig?.priceStatus || 'unknown';
  if (priceStatus === 'free') {
    return { label: 'gratuit', tone: 'free' };
  }
  if (priceStatus === 'paid') {
    return { label: 'payant', tone: 'paid' };
  }
  if (priceStatus === 'variable') {
    return { label: 'variable', tone: 'variable' };
  }
  return { label: 'inconnu', tone: 'unknown' };
}

function formatOpenRouterParameterValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : '[]';
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return String(value);
}

function getSessionStoredValue(key, sessionStorageApi = globalThis.sessionStorage) {
  try {
    return sessionStorageApi?.getItem(key) ?? null;
  } catch (error) {
    return null;
  }
}

function setSessionStoredValue(key, value, sessionStorageApi = globalThis.sessionStorage) {
  try {
    if (value === null || value === undefined || value === '') {
      sessionStorageApi?.removeItem(key);
      return;
    }

    sessionStorageApi?.setItem(key, value);
  } catch (error) {
    console.warn('Stockage de session indisponible:', error);
  }
}

function clearStoredValue(key, storageApi = globalThis.localStorage) {
  try {
    storageApi?.removeItem(key);
  } catch (error) {
    console.warn('Impossible de supprimer la valeur stockee:', error);
  }
}

export function createModelSelectionController({
  appState,
  getModelsConfig,
  getModelCatalog,
  fetchOpenRouterModels,
  defaultModelId,
  defaultQuantId,
  getStoredValue,
  setStoredValue,
  storageKeys,
  formatDownloadSize,
  hasWebGPU,
  getWebGPUStatus,
  resolveGenerationOptions,
  analysisMaxNewTokens,
  syncChatAvailability,
  updateChatCapabilitiesBanner,
  addSystemMessage,
  initAI,
  releaseCurrentModel,
  getSemanticSearchConfig,
  getSemanticSearchModes,
  getSemanticRagStatus,
  loadSemanticRag,
  releaseSemanticRag,
  consentModal
}) {
  const openRouterCatalogState = {
    status: appState.openRouterCatalogStatus || 'idle',
    models: Array.isArray(appState.openRouterModels) ? [...appState.openRouterModels] : [],
    error: appState.openRouterCatalogError || null,
    filter: 'all',
    searchQuery: '',
    loadingPromise: null
  };
  const openRouterPickerState = {
    isOpen: false,
    activeIndex: -1,
    detailsExpanded: false,
    flatModelIds: []
  };
  let semanticRagUiReady = false;
  let semanticRagUiBootPromise = null;

  function syncOpenRouterCatalogState() {
    appState.openRouterCatalogStatus = openRouterCatalogState.status;
    appState.openRouterModels = [...openRouterCatalogState.models];
    appState.openRouterCatalogError = openRouterCatalogState.error || null;
  }

  syncOpenRouterCatalogState();

  async function resolveSemanticWebGPUStatus() {
    if (typeof getWebGPUStatus === 'function') {
      try {
        const status = await getWebGPUStatus();
        if (status && typeof status === 'object') {
          return status;
        }
      } catch (error) {
        console.warn('Verification WebGPU indisponible pour le resume du RAG semantique.', error);
      }
    }

    const supported = hasWebGPU();
    return {
      supported,
      adapterAvailable: supported,
      reason: supported ? 'unknown' : 'unsupported',
      message: supported ? '' : 'WebGPU n est pas disponible sur cet appareil.'
    };
  }

  function buildSemanticWebGPUBlockedText(status) {
    if (!status?.supported) {
      return 'WebGPU absent: ce mode semantique local reste indisponible sur cet appareil.';
    }

    return `${status?.message || 'Aucun adaptateur GPU compatible n est disponible pour ce mode semantique local.'} Le telechargement du modele d embedding reste bloque.`;
  }

  function getDefaultModel() {
    const modelsConfig = getModelsConfig();
    return modelsConfig.find(model => model.id === defaultModelId) || modelsConfig[0] || null;
  }

  function getDefaultQuant(model) {
    if (!model || !model.quantizations) {
      return null;
    }

    return model.quantizations.find(q => q.id === defaultQuantId) || model.quantizations.find(q => q.default) || model.quantizations[0];
  }

  function getRemoteProviders() {
    return Array.isArray(getModelCatalog?.()?.remote_providers)
      ? getModelCatalog().remote_providers
      : [];
  }

  function getOpenRouterProviderConfig() {
    const providers = getRemoteProviders();
    return providers.find(provider => provider.id === OPENROUTER_SOURCE_ID)
      || providers.find(provider => provider.id === LEGACY_OPENROUTER_SOURCE_ID)
      || providers[0]
      || null;
  }

  function getOpenRouterModels() {
    return Array.isArray(openRouterCatalogState.models) ? openRouterCatalogState.models : [];
  }

  function setOpenRouterCatalogStatus(status, { models, error } = {}) {
    openRouterCatalogState.status = status;

    if (Array.isArray(models)) {
      openRouterCatalogState.models = models;
    }

    if (error !== undefined) {
      openRouterCatalogState.error = error;
    }

    syncOpenRouterCatalogState();
  }

  function getRemoteProviderModels(providerConfig = getOpenRouterProviderConfig()) {
    if (providerConfig?.id === OPENROUTER_SOURCE_ID && providerConfig?.live_catalog === true) {
      return getOpenRouterModels();
    }

    return Array.isArray(providerConfig?.models) ? providerConfig.models : [];
  }

  function resolvePreferredOpenRouterModel(remoteModels) {
    if (!Array.isArray(remoteModels) || remoteModels.length === 0) {
      return null;
    }

    const storedModelId = getStoredValue(storageKeys.openRouterModelId);
    return remoteModels.find(model => model.id === storedModelId)
      || remoteModels.find(model => model.id === OPENROUTER_DEFAULT_MODEL_ID)
      || remoteModels.find(model => model.isFree)
      || remoteModels.find(model => model.id === OPENROUTER_FALLBACK_MODEL_ID)
      || remoteModels[0]
      || null;
  }

  function getDefaultOpenRouterModel(providerConfig = getOpenRouterProviderConfig()) {
    return resolvePreferredOpenRouterModel(getRemoteProviderModels(providerConfig));
  }

  function hasOpenRouterProvider() {
    return Boolean(getOpenRouterProviderConfig());
  }

  function isAdvancedOptionsOpen() {
    const options = document.getElementById('advanced-options');
    return Boolean(options && !options.hidden);
  }

  function getSelectedInferenceSource() {
    const sourceSelect = document.getElementById('ai-source-select');
    const storedSource = getStoredValue(storageKeys.inferenceSource);
    const normalizedStoredSource = storedSource === LEGACY_OPENROUTER_SOURCE_ID
      ? ONLINE_SOURCE_ID
      : storedSource;
    const fallbackSource = hasOpenRouterProvider() ? ONLINE_SOURCE_ID : LOCAL_SOURCE_ID;
    const preferredSource = sourceSelect?.value || normalizedStoredSource || fallbackSource;

    if (preferredSource === OPENROUTER_SOURCE_ID && !hasOpenRouterProvider()) {
      return LOCAL_SOURCE_ID;
    }

    return preferredSource;
  }

  function isThinkingModeEnabled() {
    if (getSelectedInferenceSource() === OPENROUTER_SOURCE_ID) {
      return false;
    }

    const toggle = document.getElementById('thinking-mode-toggle');
    return Boolean(toggle && toggle.checked);
  }

  function isSemanticRagEnabled() {
    const toggle = document.getElementById('semantic-rag-toggle');
    return Boolean(toggle && toggle.checked);
  }

  function getSemanticRagMode() {
    const select = document.getElementById('semantic-rag-mode-select');
    return select?.value || getStoredValue(storageKeys.semanticRagMode) || 'single_vector';
  }

  function getStoredOpenRouterApiKey() {
    return getStoredValue(storageKeys.openRouterApiKey) || getSessionStoredValue(storageKeys.openRouterApiKey) || '';
  }

  function getOpenRouterApiKey() {
    const input = document.getElementById('openrouter-api-key');
    return (input?.value || getStoredOpenRouterApiKey() || '').trim();
  }

  function isOpenRouterRememberKeyEnabled() {
    const toggle = document.getElementById('openrouter-remember-key');
    if (toggle) {
      return Boolean(toggle.checked);
    }

    return getStoredValue(storageKeys.openRouterRememberKey) === 'true';
  }

  function loadOpenRouterCredentialsIntoUi() {
    const input = document.getElementById('openrouter-api-key');
    const rememberToggle = document.getElementById('openrouter-remember-key');
    const storedApiKey = getStoredOpenRouterApiKey();

    if (input && storedApiKey && !input.value) {
      input.value = storedApiKey;
    }

    if (rememberToggle) {
      rememberToggle.checked = getStoredValue(storageKeys.openRouterRememberKey) === 'true';
    }
  }

  function persistOpenRouterCredentials({
    apiKey,
    remember
  }) {
    const normalizedApiKey = String(apiKey || '').trim();
    const shouldRemember = Boolean(remember);

    setStoredValue(storageKeys.openRouterRememberKey, shouldRemember ? 'true' : 'false');

    if (!normalizedApiKey) {
      clearStoredValue(storageKeys.openRouterApiKey);
      setSessionStoredValue(storageKeys.openRouterApiKey, null);
      return;
    }

    if (shouldRemember) {
      setStoredValue(storageKeys.openRouterApiKey, normalizedApiKey);
      setSessionStoredValue(storageKeys.openRouterApiKey, null);
      return;
    }

    clearStoredValue(storageKeys.openRouterApiKey);
    setSessionStoredValue(storageKeys.openRouterApiKey, normalizedApiKey);
  }

  function clearOpenRouterCredentials() {
    const input = document.getElementById('openrouter-api-key');
    const rememberToggle = document.getElementById('openrouter-remember-key');

    if (input) {
      input.value = '';
    }

    if (rememberToggle) {
      rememberToggle.checked = false;
    }

    clearStoredValue(storageKeys.openRouterApiKey);
    clearStoredValue(storageKeys.openRouterRememberKey);
    setSessionStoredValue(storageKeys.openRouterApiKey, null);
  }

  function resolveThinkingModeFlag(modelConfig = null, explicitValue) {
    if (modelConfig?.supportsThinking === false) {
      return false;
    }

    if (typeof explicitValue === 'boolean') {
      return explicitValue;
    }

    return Boolean(modelConfig?.thinkingEnabled);
  }

  function syncActiveModelThinkingState() {
    if (!appState.activeModelConfig || typeof appState.activeModelConfig !== 'object') {
      return;
    }

    appState.activeModelConfig = {
      ...appState.activeModelConfig,
      thinkingEnabled: appState.activeModelConfig.supportsThinking === false
        ? false
        : isThinkingModeEnabled()
    };
  }

  function setAdvancedOptionsOpen(enabled) {
    const options = document.getElementById('advanced-options');
    const toggleBtn = document.getElementById('model-settings-toggle');
    const toolbarShell = document.querySelector('.model-toolbar-shell');
    const chatPanel = toolbarShell?.closest('.panel-chat') || document.getElementById('chat-panel');
    const isEnabled = Boolean(enabled);

    if (!isEnabled) {
      closeOpenRouterPicker({
        resetSearch: true,
        skipRender: true
      });
    }

    if (options) {
      options.hidden = !isEnabled;
      options.setAttribute('aria-hidden', isEnabled ? 'false' : 'true');
    }

    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', isEnabled ? 'true' : 'false');
      toggleBtn.classList.toggle('active', isEnabled);
    }

    if (toolbarShell) {
      toolbarShell.classList.toggle('advanced-options-open', isEnabled);
    }

    if (chatPanel) {
      chatPanel.classList.toggle('advanced-options-open', isEnabled);
    }
  }

  function setThinkingMode(enabled, { persist = true } = {}) {
    const toggle = document.getElementById('thinking-mode-toggle');
    const effectiveEnabled = getSelectedInferenceSource() === OPENROUTER_SOURCE_ID ? false : Boolean(enabled);

    if (toggle) {
      toggle.checked = effectiveEnabled;
    }

    if (persist && getSelectedInferenceSource() !== OPENROUTER_SOURCE_ID) {
      setStoredValue(storageKeys.thinkingMode, effectiveEnabled ? 'true' : 'false');
    }

    syncActiveModelThinkingState();
    updateModelSelectionSummary();
  }

  function setSemanticRagEnabled(enabled, {
    persist = true,
    refreshSummary = true
  } = {}) {
    const toggle = document.getElementById('semantic-rag-toggle');
    if (toggle) {
      toggle.checked = Boolean(enabled);
    }

    if (persist) {
      setStoredValue(storageKeys.semanticRagEnabled, enabled ? 'true' : 'false');
    }

    if (refreshSummary) {
      void ensureSemanticRagUiReady().then(() => updateSemanticRagSummary());
    }
  }

  function setSemanticRagMode(mode, {
    persist = true,
    refreshSummary = true
  } = {}) {
    const nextMode = mode || 'single_vector';
    const select = document.getElementById('semantic-rag-mode-select');
    if (select) {
      select.value = nextMode;
    }

    if (persist) {
      setStoredValue(storageKeys.semanticRagMode, nextMode);
    }

    if (refreshSummary) {
      void ensureSemanticRagUiReady().then(() => updateSemanticRagSummary());
    }
  }

  function syncThinkingAvailability() {
    const toggle = document.getElementById('thinking-mode-toggle');
    const help = document.getElementById('thinking-help');
    const localToggleSlot = document.getElementById('thinking-local-toggle-slot');
    const remoteInfo = document.getElementById('thinking-remote-info');
    const remoteInfoTitle = remoteInfo?.querySelector('.thinking-remote-title');
    const remoteInfoCopy = remoteInfo?.querySelector('.thinking-remote-copy');
    if (!toggle || !help || !localToggleSlot || !remoteInfo || !remoteInfoTitle || !remoteInfoCopy) {
      return;
    }

    const isRemoteSource = getSelectedInferenceSource() === OPENROUTER_SOURCE_ID;
    const storedThinkingMode = getStoredValue(storageKeys.thinkingMode) === 'true';

    toggle.checked = storedThinkingMode;
    help.textContent = DEFAULT_THINKING_HELP_TEXT;
    remoteInfoTitle.textContent = REMOTE_THINKING_INFO_TITLE;
    remoteInfoCopy.textContent = REMOTE_THINKING_INFO_TEXT;

    if (isRemoteSource) {
      toggle.disabled = true;
      localToggleSlot.hidden = true;
      help.hidden = true;
      remoteInfo.hidden = false;
      return;
    }

    toggle.disabled = false;
    localToggleSlot.hidden = false;
    help.hidden = false;
    remoteInfo.hidden = true;
  }

  async function populateSemanticRagModeSelect() {
    const select = document.getElementById('semantic-rag-mode-select');
    if (!select) {
      return;
    }

    const availableModes = typeof getSemanticSearchModes === 'function'
      ? await getSemanticSearchModes()
      : [];
    const preferredMode = getStoredValue(storageKeys.semanticRagMode) || 'single_vector';
    const fallbackMode = availableModes.find(mode => mode.default)?.id || availableModes[0]?.id || 'single_vector';
    const selectedMode = availableModes.some(mode => mode.id === preferredMode)
      ? preferredMode
      : fallbackMode;

    select.innerHTML = '';

    availableModes.forEach(mode => {
      const option = document.createElement('option');
      option.value = mode.id;
      option.textContent = mode.experimental ? `${mode.label} (exp)` : mode.label;
      select.appendChild(option);
    });

    select.value = selectedMode;
    select.disabled = availableModes.length <= 1;
    setStoredValue(storageKeys.semanticRagMode, selectedMode);
  }

  async function ensureSemanticRagUiReady() {
    if (semanticRagUiReady) {
      return;
    }

    if (semanticRagUiBootPromise) {
      return semanticRagUiBootPromise;
    }

    semanticRagUiBootPromise = populateSemanticRagModeSelect()
      .then(async () => {
        await updateSemanticRagSummary();
        semanticRagUiReady = true;
      })
      .finally(() => {
        semanticRagUiBootPromise = null;
      });

    return semanticRagUiBootPromise;
  }

  async function updateSemanticRagSummary() {
    const helperEl = document.getElementById('semantic-rag-helper');
    const sizeEl = document.getElementById('semantic-rag-size');
    const statusEl = document.getElementById('semantic-rag-status');
    const toggle = document.getElementById('semantic-rag-toggle');
    const modeSelect = document.getElementById('semantic-rag-mode-select');
    if (!helperEl || !sizeEl || !statusEl || !toggle || !modeSelect) {
      return;
    }

    const selectedMode = getSemanticRagMode();
    const config = typeof getSemanticSearchConfig === 'function'
      ? await getSemanticSearchConfig(selectedMode)
      : { available: false, model: null, artifact: null, totalEstimatedDownloadMb: null };
    const runtimeStatus = typeof getSemanticRagStatus === 'function'
      ? getSemanticRagStatus()
      : { enabled: false, ready: false, status: 'disabled', model: null, modeId: selectedMode };
    const totalLabel = formatDownloadSize(config?.totalEstimatedDownloadMb ?? null);
    const artifactLabel = formatDownloadSize(config?.artifact?.downloadMb ?? null);
    const semanticModelLabel = config?.model?.id || config?.model?.browserModelId || 'modele dedie';
    const semanticModelDescriptor = config?.model?.family === 'e5'
      ? `encodeur multilingue dedie ${semanticModelLabel}`
      : `modele dedie ${semanticModelLabel}`;
    const modeLabel = config?.label || selectedMode;
    const webGPUStatus = await resolveSemanticWebGPUStatus();

    if (!config?.available) {
      helperEl.textContent = `Mode ${modeLabel} non publie pour le moment. Le chemin exact reste lexical et le mode single-vector demeure la voie stable.`;
      sizeEl.textContent = 'Artefact semantique indisponible';
      statusEl.textContent = 'Ce mode n est pas disponible. Les analyses restent sur le chemin lexical.';
      toggle.disabled = true;
      return;
    }

    helperEl.textContent = `Reranking ${modeLabel} apres la recherche lexicale. Le mode semantique utilise ${semanticModelDescriptor}.`;
    sizeEl.textContent = `Telechargement estime: ${totalLabel} (index: ${artifactLabel})`;
    toggle.disabled = false;

    if (runtimeStatus.status === 'loading') {
      statusEl.textContent = `Chargement local de ${modeLabel} en cours.`;
      return;
    }

    if (runtimeStatus.ready && runtimeStatus.modeId === config.modeId) {
      statusEl.textContent = `${modeLabel} actif pour le reranking semantique des analyses. Les reponses factuelles restent sur le chemin lexical.`;
      return;
    }

    if (!webGPUStatus.adapterAvailable) {
      statusEl.textContent = buildSemanticWebGPUBlockedText(webGPUStatus);
      toggle.disabled = true;
      return;
    }

    if (isSemanticRagEnabled()) {
      statusEl.textContent = `${modeLabel} est memorise pour cet appareil, mais pas encore charge dans cette session. Coupez puis reactivez le commutateur pour confirmer le chargement local.`;
      return;
    }

    statusEl.textContent = `Desactive. Activez le commutateur pour charger ${modeLabel} en local.`;
  }

  async function activateSemanticRagFromUi() {
    const selectedMode = getSemanticRagMode();
    const config = typeof getSemanticSearchConfig === 'function'
      ? await getSemanticSearchConfig(selectedMode)
      : null;

    if (!config?.available) {
      addSystemMessage('Le RAG semantique local n est pas encore disponible dans les artefacts publics.');
      setSemanticRagEnabled(false);
      return false;
    }

    const webGPUStatus = await resolveSemanticWebGPUStatus();
    if (!webGPUStatus.adapterAvailable) {
      addSystemMessage(buildSemanticWebGPUBlockedText(webGPUStatus));
      setSemanticRagEnabled(false);
      await updateSemanticRagSummary();
      return false;
    }

    const confirmed = globalThis.confirm?.(
      `Activer le mode ${config.label || config.modeId} du RAG semantique local ?\n\nEncodeur dedie: ${config.model?.id || config.model?.browserModelId}\nUsage: ${config.model?.usage === 'asymmetric_retrieval' ? 'retrieval asymetrique multilingue' : 'recherche semantique locale'}\nIndex semantique: ${formatDownloadSize(config.artifact?.downloadMb ?? null)}\nTelechargement total estime: ${formatDownloadSize(config.totalEstimatedDownloadMb ?? null)}\n\nLe telechargement n est jamais lance sans votre confirmation.`
    );

    if (confirmed === false) {
      setSemanticRagEnabled(false);
      return false;
    }

    const loaded = await loadSemanticRag?.(config.modeId || selectedMode);
    if (!loaded) {
      setSemanticRagEnabled(false);
      await updateSemanticRagSummary();
      return false;
    }

    setSemanticRagEnabled(true);
    await updateSemanticRagSummary();
    return true;
  }

  function buildOpenRouterAppliedParameters(modelConfig) {
    if (!modelConfig || typeof resolveGenerationOptions !== 'function') {
      return {};
    }

    const resolved = resolveGenerationOptions(
      modelConfig,
      {},
      { max_new_tokens: analysisMaxNewTokens }
    );
    const applied = {};
    const maxTokens = Number.isFinite(resolved.max_tokens)
      ? resolved.max_tokens
      : Number.isFinite(resolved.max_new_tokens)
        ? resolved.max_new_tokens
        : null;

    if (Number.isFinite(maxTokens)) {
      applied.max_tokens = maxTokens;
    }

    OPENROUTER_PARAMETER_KEYS
      .filter(key => key !== 'max_tokens')
      .forEach(key => {
        const value = resolved[key];
        if (value === null || value === undefined) {
          return;
        }

        if (typeof value === 'number' && !Number.isFinite(value)) {
          return;
        }

        applied[key] = value;
      });

    return applied;
  }

  function renderOpenRouterParameterList(container, entries, emptyLabel) {
    if (!container) {
      return;
    }

    container.innerHTML = '';

    if (!Array.isArray(entries) || entries.length === 0) {
      const chip = document.createElement('span');
      chip.className = 'openrouter-parameter-chip empty';
      chip.textContent = emptyLabel;
      container.appendChild(chip);
      return;
    }

    entries.forEach(entry => {
      const chip = document.createElement('span');
      chip.className = 'openrouter-parameter-chip';
      chip.textContent = entry.value
        ? `${entry.label}: ${entry.value}`
        : entry.label;
      container.appendChild(chip);
    });
  }

  function syncOpenRouterFilterButtons() {
    document.querySelectorAll('[data-openrouter-filter]').forEach(button => {
      const isActive = button.dataset.openrouterFilter === openRouterCatalogState.filter;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function updateOpenRouterPickerTrigger(modelConfig = getSelectedOpenRouterModelConfig()) {
    const trigger = document.getElementById('openrouter-model-trigger');
    const nameEl = document.getElementById('openrouter-trigger-name');
    const idEl = document.getElementById('openrouter-trigger-id');
    const badgeEl = document.getElementById('openrouter-trigger-price-badge');
    const providerConfig = getOpenRouterProviderConfig();

    if (!trigger || !nameEl || !idEl || !badgeEl) {
      return;
    }

    trigger.disabled = !providerConfig;
    trigger.setAttribute('aria-expanded', openRouterPickerState.isOpen ? 'true' : 'false');

    let label = 'Choisir un modèle OpenRouter';
    let secondary = 'Le catalogue distant sera chargé à la demande.';
    let badge = { label: 'indisponible', tone: 'unknown' };

    if (!providerConfig) {
      label = 'OpenRouter indisponible';
      secondary = 'Le fournisseur distant n apparaît pas dans le catalogue local.';
    } else if (modelConfig?.provider === OPENROUTER_SOURCE_ID) {
      label = modelConfig.name || 'Modèle distant';
      secondary = modelConfig.providerModelId || modelConfig.id || 'Identifiant indisponible';
      badge = buildOpenRouterPriceBadge(modelConfig);
    } else if (openRouterCatalogState.status === 'loading') {
      label = 'Chargement du catalogue OpenRouter';
      secondary = 'Le catalogue distant est en cours de récupération.';
    } else if (openRouterCatalogState.status === 'error') {
      label = 'Catalogue OpenRouter indisponible';
      secondary = openRouterCatalogState.error?.message || 'Réessayez plus tard.';
    }

    nameEl.textContent = label;
    idEl.textContent = secondary;
    badgeEl.textContent = badge.label;
    badgeEl.className = `openrouter-price-badge ${badge.tone}`;
  }

  function syncOpenRouterDetailsUi(modelConfig = getSelectedOpenRouterModelConfig()) {
    const detailsToggle = document.getElementById('openrouter-model-details-toggle');
    const detailsEl = document.getElementById('openrouter-model-details');
    const hasDetails = Boolean(modelConfig && modelConfig.provider === OPENROUTER_SOURCE_ID);

    if (!detailsToggle || !detailsEl) {
      return;
    }

    detailsToggle.hidden = !hasDetails;
    if (!hasDetails) {
      detailsToggle.textContent = 'Afficher les détails du modèle';
      detailsToggle.setAttribute('aria-expanded', 'false');
      detailsEl.hidden = true;
      return;
    }

    detailsToggle.textContent = openRouterPickerState.detailsExpanded
      ? 'Masquer les détails du modèle'
      : 'Afficher les détails du modèle';
    detailsToggle.setAttribute('aria-expanded', openRouterPickerState.detailsExpanded ? 'true' : 'false');
    detailsEl.hidden = !openRouterPickerState.detailsExpanded;
  }

  function buildOpenRouterCompactNote(modelConfig) {
    if (!modelConfig) {
      return 'Le catalogue OpenRouter est consulté en direct et n envoie aucun prompt utilisateur pendant ce chargement.';
    }

    const note = modelConfig.notes || 'Backend distant optionnel. Seules les analyses enverront un contexte court hors du navigateur.';
    return note.length > 180
      ? `${note.slice(0, 177).trimEnd()}...`
      : note;
  }

  function updateOpenRouterModelSummary(modelConfig = getSelectedOpenRouterModelConfig()) {
    const summaryEl = document.getElementById('openrouter-model-summary');
    const nameEl = document.getElementById('openrouter-selected-name');
    const idEl = document.getElementById('openrouter-selected-id');
    const noteEl = document.getElementById('openrouter-selected-note');
    const priceBadgeEl = document.getElementById('openrouter-selected-price-badge');
    const pricingEl = document.getElementById('openrouter-selected-pricing');
    const contextEl = document.getElementById('openrouter-selected-context');
    const outputEl = document.getElementById('openrouter-selected-output');
    const appliedEl = document.getElementById('openrouter-params-applied');
    const inactiveEl = document.getElementById('openrouter-params-inactive');
    const unsupportedEl = document.getElementById('openrouter-params-unsupported');

    updateOpenRouterPickerTrigger(modelConfig);

    if (!summaryEl || !nameEl || !idEl || !noteEl || !priceBadgeEl || !pricingEl || !contextEl || !outputEl || !appliedEl || !inactiveEl || !unsupportedEl) {
      return;
    }

    if (!modelConfig || modelConfig.provider !== OPENROUTER_SOURCE_ID) {
      summaryEl.hidden = true;
      syncOpenRouterDetailsUi(null);
      return;
    }

    summaryEl.hidden = false;
    nameEl.textContent = modelConfig.name || 'Modèle distant';
    idEl.textContent = modelConfig.providerModelId || modelConfig.id || 'Identifiant indisponible';
    noteEl.textContent = buildOpenRouterCompactNote(modelConfig);

    const priceBadge = buildOpenRouterPriceBadge(modelConfig);
    priceBadgeEl.textContent = priceBadge.label;
    priceBadgeEl.className = `openrouter-price-badge ${priceBadge.tone}`;

    pricingEl.textContent = buildOpenRouterPricingSummary(modelConfig);
    contextEl.textContent = modelConfig.contextLength
      ? `${formatIntegerLabel(modelConfig.contextLength)} tokens`
      : 'Inconnu';
    outputEl.textContent = modelConfig.maxCompletionTokens
      ? `${formatIntegerLabel(modelConfig.maxCompletionTokens)} tokens`
      : 'Selon le provider';

    const appliedParameters = buildOpenRouterAppliedParameters(modelConfig);
    const appliedKeys = Object.keys(appliedParameters);
    const supportedSet = new Set(Array.isArray(modelConfig.supportedParameters) ? modelConfig.supportedParameters : []);
    const inactiveKeys = OPENROUTER_PARAMETER_KEYS.filter(key => supportedSet.has(key) && !appliedKeys.includes(key));
    const unsupportedKeys = OPENROUTER_PARAMETER_KEYS.filter(key => !supportedSet.has(key));

    renderOpenRouterParameterList(
      appliedEl,
      appliedKeys.map(key => ({
        label: OPENROUTER_PARAMETER_LABELS[key] || key,
        value: formatOpenRouterParameterValue(appliedParameters[key])
      })),
      'Aucun'
    );
    renderOpenRouterParameterList(
      inactiveEl,
      inactiveKeys.map(key => ({
        label: OPENROUTER_PARAMETER_LABELS[key] || key,
        value: null
      })),
      'Aucun'
    );
    renderOpenRouterParameterList(
      unsupportedEl,
      unsupportedKeys.map(key => ({
        label: OPENROUTER_PARAMETER_LABELS[key] || key,
        value: null
      })),
      'Aucun'
    );

    syncOpenRouterDetailsUi(modelConfig);
  }

  function getFilteredOpenRouterModels() {
    const normalizedQuery = openRouterCatalogState.searchQuery.trim().toLowerCase();

    return getOpenRouterModels().filter(model => {
      if (openRouterCatalogState.filter === 'free' && !model.isFree) {
        return false;
      }

      if (openRouterCatalogState.filter === 'paid' && model.priceStatus === 'free') {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return model.searchText.includes(normalizedQuery);
    });
  }

  function buildSuggestedFreeOpenRouterModels(filteredModels) {
    const stableModels = [];
    const experimentalModels = [];

    filteredModels.forEach(model => {
      if (!model.isFree) {
        return;
      }

      if (model.status === 'experimental') {
        experimentalModels.push(model);
        return;
      }

      stableModels.push(model);
    });

    return stableModels.concat(experimentalModels).slice(0, 6);
  }

  function buildOpenRouterModelGroups(selectedModel = getSelectedOpenRouterModelConfig()) {
    const filteredModels = getFilteredOpenRouterModels();
    const filteredIds = new Set(filteredModels.map(model => model.id));
    const groups = [];

    if (selectedModel && !filteredIds.has(selectedModel.id)) {
      groups.push({
        key: 'selection-actuelle',
        title: 'Sélection actuelle',
        models: [selectedModel]
      });
    }

    const suggestedModels = buildSuggestedFreeOpenRouterModels(filteredModels);
    const suggestedIds = new Set(suggestedModels.map(model => model.id));

    if (suggestedModels.length > 0) {
      groups.push({
        key: 'suggestions-gratuites',
        title: 'Suggestions gratuites',
        models: suggestedModels
      });
    }

    const providerGroups = new Map();
    filteredModels.forEach(model => {
      if (suggestedIds.has(model.id)) {
        return;
      }

      const groupName = model.providerLabel || model.providerGroup || 'Autres';
      if (!providerGroups.has(groupName)) {
        providerGroups.set(groupName, []);
      }
      providerGroups.get(groupName).push(model);
    });

    providerGroups.forEach((models, groupName) => {
      groups.push({
        key: `provider-${groupName}`,
        title: groupName,
        models
      });
    });

    return groups;
  }

  function resolvePreferredOpenRouterActiveIndex(selectedModelId = getSelectedOpenRouterModelConfig()?.id) {
    if (!Array.isArray(openRouterPickerState.flatModelIds) || openRouterPickerState.flatModelIds.length === 0) {
      return -1;
    }

    const selectedIndex = selectedModelId
      ? openRouterPickerState.flatModelIds.indexOf(selectedModelId)
      : -1;

    return selectedIndex >= 0 ? selectedIndex : 0;
  }

  function syncOpenRouterOptionStates(selectedModelId = getSelectedOpenRouterModelConfig()?.id) {
    const resultsEl = document.getElementById('openrouter-model-results');
    const searchInput = document.getElementById('openrouter-model-search');

    if (!resultsEl) {
      return;
    }

    let activeOptionId = '';
    resultsEl.querySelectorAll('[data-openrouter-option-index]').forEach(option => {
      const optionIndex = Number(option.dataset.openrouterOptionIndex);
      const modelId = option.dataset.openrouterModelId || '';
      const isActive = optionIndex === openRouterPickerState.activeIndex;
      const isSelected = Boolean(selectedModelId && modelId === selectedModelId);

      option.classList.toggle('active', isActive);
      option.classList.toggle('selected', isSelected);
      option.setAttribute('aria-selected', isSelected ? 'true' : 'false');

      if (isActive) {
        activeOptionId = option.id;
      }
    });

    if (searchInput) {
      if (activeOptionId && openRouterPickerState.isOpen) {
        searchInput.setAttribute('aria-activedescendant', activeOptionId);
      } else {
        searchInput.removeAttribute('aria-activedescendant');
      }
    }
  }

  function scrollActiveOpenRouterOptionIntoView() {
    const resultsEl = document.getElementById('openrouter-model-results');
    if (!resultsEl || openRouterPickerState.activeIndex < 0) {
      return;
    }

    const activeOption = resultsEl.querySelector(`[data-openrouter-option-index="${openRouterPickerState.activeIndex}"]`);
    activeOption?.scrollIntoView({ block: 'nearest' });
  }

  function setOpenRouterActiveIndex(nextIndex, { scroll = false } = {}) {
    if (!Array.isArray(openRouterPickerState.flatModelIds) || openRouterPickerState.flatModelIds.length === 0) {
      openRouterPickerState.activeIndex = -1;
      syncOpenRouterOptionStates();
      return;
    }

    const total = openRouterPickerState.flatModelIds.length;
    let normalizedIndex = nextIndex;

    if (normalizedIndex < 0) {
      normalizedIndex = total - 1;
    } else if (normalizedIndex >= total) {
      normalizedIndex = 0;
    }

    openRouterPickerState.activeIndex = normalizedIndex;
    syncOpenRouterOptionStates();

    if (scroll) {
      requestAnimationFrame(scrollActiveOpenRouterOptionIntoView);
    }
  }

  function syncOpenRouterPickerVisibility() {
    const trigger = document.getElementById('openrouter-model-trigger');
    const popover = document.getElementById('openrouter-model-popover');

    if (trigger) {
      trigger.setAttribute('aria-expanded', openRouterPickerState.isOpen ? 'true' : 'false');
    }

    if (popover) {
      popover.hidden = !openRouterPickerState.isOpen;
    }
  }

  function closeOpenRouterPicker({
    resetSearch = true,
    focusTrigger = false,
    skipRender = false
  } = {}) {
    const searchInput = document.getElementById('openrouter-model-search');
    const trigger = document.getElementById('openrouter-model-trigger');

    openRouterPickerState.isOpen = false;
    if (resetSearch) {
      openRouterCatalogState.searchQuery = '';
      if (searchInput) {
        searchInput.value = '';
      }
    }
    openRouterPickerState.activeIndex = -1;

    syncOpenRouterPickerVisibility();

    if (!skipRender) {
      renderOpenRouterModelResults({ resetActive: true });
    } else {
      syncOpenRouterOptionStates();
    }

    if (focusTrigger) {
      trigger?.focus();
    }
  }

  function openOpenRouterPicker() {
    const searchInput = document.getElementById('openrouter-model-search');

    if (!hasOpenRouterProvider()) {
      return;
    }

    openRouterPickerState.isOpen = true;
    syncOpenRouterPickerVisibility();
    renderOpenRouterModelResults({
      resetActive: true,
      scrollActiveIntoView: true
    });

    requestAnimationFrame(() => {
      searchInput?.focus();
      searchInput?.select?.();
    });
  }

  function selectOpenRouterModel(modelId, { closePicker = true } = {}) {
    const select = document.getElementById('openrouter-model-select');

    if (!select || !modelId) {
      return;
    }

    const hasMatchingOption = Array.from(select.options).some(option => option.value === modelId);
    if (!hasMatchingOption) {
      return;
    }

    select.value = modelId;
    setStoredValue(storageKeys.openRouterModelId, modelId);
    openRouterPickerState.detailsExpanded = false;

    if (closePicker) {
      closeOpenRouterPicker({
        resetSearch: true,
        skipRender: true
      });
    }

    updateModelSelectionSummary();
    renderOpenRouterModelResults({ resetActive: true });
  }

  function renderOpenRouterModelResults({
    resetActive = false,
    scrollActiveIntoView = false
  } = {}) {
    const resultsEl = document.getElementById('openrouter-model-results');
    const searchInput = document.getElementById('openrouter-model-search');
    const selectedModel = getSelectedOpenRouterModelConfig();

    if (!resultsEl || !searchInput) {
      return;
    }

    syncOpenRouterFilterButtons();
    searchInput.disabled = openRouterCatalogState.status !== 'ready';
    searchInput.value = openRouterCatalogState.searchQuery;
    resultsEl.innerHTML = '';
    openRouterPickerState.flatModelIds = [];

    const appendEmptyState = message => {
      const stateEl = document.createElement('div');
      stateEl.className = 'openrouter-model-empty';
      stateEl.textContent = message;
      resultsEl.appendChild(stateEl);
      openRouterPickerState.activeIndex = -1;
      syncOpenRouterOptionStates(selectedModel?.id);
      updateOpenRouterModelSummary(selectedModel);
    };

    if (openRouterCatalogState.status === 'loading') {
      appendEmptyState('Chargement du catalogue OpenRouter en cours...');
      return;
    }

    if (openRouterCatalogState.status === 'error') {
      appendEmptyState(openRouterCatalogState.error?.message || 'Impossible de charger la liste des modèles OpenRouter.');
      return;
    }

    if (openRouterCatalogState.status !== 'ready') {
      appendEmptyState('Sélectionnez OpenRouter pour charger le catalogue distant.');
      return;
    }

    const groups = buildOpenRouterModelGroups(selectedModel);
    const hasRenderableModels = groups.some(group => Array.isArray(group.models) && group.models.length > 0);
    if (!hasRenderableModels) {
      appendEmptyState('Aucun modèle ne correspond à la recherche ou au filtre actif.');
      return;
    }

    groups.forEach(group => {
      if (!Array.isArray(group.models) || group.models.length === 0) {
        return;
      }

      const groupEl = document.createElement('div');
      groupEl.className = 'openrouter-model-group';

      const titleEl = document.createElement('div');
      titleEl.className = 'openrouter-model-group-title';
      titleEl.textContent = group.title;
      groupEl.appendChild(titleEl);

      group.models.forEach(model => {
        const optionIndex = openRouterPickerState.flatModelIds.length;
        const badge = buildOpenRouterPriceBadge(model);
        const isSelected = selectedModel?.id === model.id;

        openRouterPickerState.flatModelIds.push(model.id);

        const button = document.createElement('button');
        button.type = 'button';
        button.id = `openrouter-option-${optionIndex}`;
        button.className = 'openrouter-model-option';
        button.setAttribute('role', 'option');
        button.dataset.openrouterOptionIndex = String(optionIndex);
        button.dataset.openrouterModelId = model.id;

        const mainRow = document.createElement('div');
        mainRow.className = 'openrouter-model-option-main';

        const copyEl = document.createElement('div');
        copyEl.className = 'openrouter-model-option-copy';

        const nameEl = document.createElement('span');
        nameEl.className = 'openrouter-model-option-name';
        nameEl.textContent = model.name;

        const idEl = document.createElement('span');
        idEl.className = 'openrouter-model-option-id';
        idEl.textContent = model.id;

        copyEl.appendChild(nameEl);
        copyEl.appendChild(idEl);

        if (isSelected) {
          const stateEl = document.createElement('span');
          stateEl.className = 'openrouter-model-option-state';
          stateEl.textContent = 'Actif';
          copyEl.appendChild(stateEl);
        }

        const badgeEl = document.createElement('span');
        badgeEl.className = `openrouter-price-badge ${badge.tone}`;
        badgeEl.textContent = badge.label;

        mainRow.appendChild(copyEl);
        mainRow.appendChild(badgeEl);

        const metaRow = document.createElement('div');
        metaRow.className = 'openrouter-model-option-meta';

        const pricingEl = document.createElement('span');
        pricingEl.className = 'openrouter-pill';
        pricingEl.textContent = buildOpenRouterPricingSummary(model);

        const contextEl = document.createElement('span');
        contextEl.className = 'openrouter-pill';
        contextEl.textContent = model.contextLength
          ? `${formatIntegerLabel(model.contextLength)} tok`
          : 'contexte inconnu';

        metaRow.appendChild(pricingEl);
        metaRow.appendChild(contextEl);

        button.appendChild(mainRow);
        button.appendChild(metaRow);
        button.addEventListener('click', () => {
          selectOpenRouterModel(model.id);
        });
        button.addEventListener('mouseenter', () => {
          setOpenRouterActiveIndex(optionIndex);
        });

        groupEl.appendChild(button);
      });

      resultsEl.appendChild(groupEl);
    });

    const hasActiveOption = openRouterPickerState.activeIndex >= 0
      && openRouterPickerState.activeIndex < openRouterPickerState.flatModelIds.length;

    if (resetActive || !hasActiveOption) {
      openRouterPickerState.activeIndex = resolvePreferredOpenRouterActiveIndex(selectedModel?.id);
    }

    syncOpenRouterOptionStates(selectedModel?.id);
    if (scrollActiveIntoView) {
      requestAnimationFrame(scrollActiveOpenRouterOptionIntoView);
    }

    updateOpenRouterModelSummary(selectedModel);
  }

  async function ensureOpenRouterCatalogLoaded({ force = false } = {}) {
    const providerConfig = getOpenRouterProviderConfig();
    if (!providerConfig || !hasOpenRouterProvider()) {
      return [];
    }

    if (providerConfig.live_catalog !== true) {
      const models = Array.isArray(providerConfig.models) ? providerConfig.models : [];
      setOpenRouterCatalogStatus('ready', {
        models,
        error: null
      });
      return models;
    }

    if (typeof fetchOpenRouterModels !== 'function') {
      return [];
    }

    if (!force && openRouterCatalogState.status === 'ready' && getOpenRouterModels().length > 0) {
      return getOpenRouterModels();
    }

    if (openRouterCatalogState.loadingPromise) {
      return openRouterCatalogState.loadingPromise;
    }

    setOpenRouterCatalogStatus('loading', {
      error: null
    });
    renderOpenRouterModelResults();
    updateOpenRouterStatus();

    openRouterCatalogState.loadingPromise = Promise.resolve(fetchOpenRouterModels())
      .then(models => {
        setOpenRouterCatalogStatus('ready', {
          models,
          error: null
        });
        populateOpenRouterModelSelect();
        renderOpenRouterModelResults();
        updateOpenRouterStatus();
        updateModelSelectionSummary();
        return models;
      })
      .catch(error => {
        console.error('Chargement OpenRouter impossible:', error);
        setOpenRouterCatalogStatus('error', {
          models: [],
          error
        });
        populateOpenRouterModelSelect();
        renderOpenRouterModelResults();
        updateOpenRouterStatus();
        updateModelSelectionSummary();
        return [];
      })
      .finally(() => {
        openRouterCatalogState.loadingPromise = null;
      });

    return openRouterCatalogState.loadingPromise;
  }

  function populateInferenceSourceSelect() {
    const sourceSelect = document.getElementById('ai-source-select');
    if (!sourceSelect) {
      return;
    }

    const options = [];

    if (hasOpenRouterProvider()) {
      options.push({
        value: OPENROUTER_SOURCE_ID,
        label: 'IA en ligne'
      });
    }

    options.push({
      value: LOCAL_SOURCE_ID,
      label: 'Modele local'
    });

    const preferredSource = getSelectedInferenceSource();
    sourceSelect.innerHTML = '';

    options.forEach(optionConfig => {
      const option = document.createElement('option');
      option.value = optionConfig.value;
      option.textContent = optionConfig.label;
      sourceSelect.appendChild(option);
    });

    sourceSelect.value = options.some(option => option.value === preferredSource)
      ? preferredSource
      : (hasOpenRouterProvider() ? OPENROUTER_SOURCE_ID : LOCAL_SOURCE_ID);

    setStoredValue(storageKeys.inferenceSource, sourceSelect.value);
  }

  function populateOpenRouterModelSelect() {
    const select = document.getElementById('openrouter-model-select');
    const searchInput = document.getElementById('openrouter-model-search');
    if (!select) {
      return;
    }

    const providerConfig = getOpenRouterProviderConfig();
    const remoteModels = getRemoteProviderModels(providerConfig);
    const selectedModel = resolvePreferredOpenRouterModel(remoteModels);

    select.innerHTML = '';

    if (searchInput) {
      searchInput.disabled = openRouterCatalogState.status !== 'ready';
    }

    if (!providerConfig) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'OpenRouter indisponible';
      select.appendChild(option);
      select.disabled = true;
      closeOpenRouterPicker({
        resetSearch: true,
        skipRender: true
      });
      renderOpenRouterModelResults();
      return;
    }

    if (openRouterCatalogState.status === 'loading') {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Chargement du catalogue...';
      select.appendChild(option);
      select.disabled = true;
      renderOpenRouterModelResults();
      return;
    }

    if (openRouterCatalogState.status === 'error' || remoteModels.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Catalogue indisponible';
      select.appendChild(option);
      select.disabled = true;
      closeOpenRouterPicker({
        resetSearch: true,
        skipRender: true
      });
      renderOpenRouterModelResults();
      return;
    }

    remoteModels.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      select.appendChild(option);
    });

    select.disabled = false;
    if (selectedModel) {
      select.value = selectedModel.id;
      setStoredValue(storageKeys.openRouterModelId, selectedModel.id);
      openRouterPickerState.detailsExpanded = false;
    }

    renderOpenRouterModelResults();
  }

  function getSelectedOpenRouterModelConfig() {
    const providerConfig = getOpenRouterProviderConfig();
    if (!providerConfig) {
      return null;
    }

    const remoteModels = getRemoteProviderModels(providerConfig);
    const defaultModel = getDefaultOpenRouterModel(providerConfig);
    const remoteModelSelect = document.getElementById('openrouter-model-select');
    const preferredModelId = remoteModelSelect?.value || getStoredValue(storageKeys.openRouterModelId) || defaultModel?.id || null;
    const selectedRemoteModel = remoteModels.find(model => model.id === preferredModelId) || defaultModel;

    if (!selectedRemoteModel) {
      return null;
    }

    return {
      ...selectedRemoteModel,
      provider: OPENROUTER_SOURCE_ID,
      family: providerConfig.name || 'IA en ligne',
      runtime: 'online_remote',
      apiBaseUrl: providerConfig.api_base_url || '',
      turnstileSiteKey: providerConfig.turnstile_site_key || '',
      providerModelId: selectedRemoteModel.providerModelId || selectedRemoteModel.id,
      estimatedDownloadMb: null,
      supportsThinking: false,
      thinkingEnabled: false,
      pricing: selectedRemoteModel.pricing || {},
      priceStatus: selectedRemoteModel.priceStatus || 'unknown',
      isFree: selectedRemoteModel.isFree === true,
      providerLabel: selectedRemoteModel.providerLabel || providerConfig.name || 'IA en ligne',
      providerGroup: selectedRemoteModel.providerGroup || OPENROUTER_SOURCE_ID,
      supportedParameters: Array.isArray(selectedRemoteModel.supportedParameters) ? selectedRemoteModel.supportedParameters : [],
      defaultParameters: selectedRemoteModel.defaultParameters || {},
      contextLength: selectedRemoteModel.contextLength ?? null,
      maxCompletionTokens: selectedRemoteModel.maxCompletionTokens ?? null,
      displayName: `${providerConfig.name || 'IA en ligne'} · ${selectedRemoteModel.name}`,
      signature: `${OPENROUTER_SOURCE_ID}:${selectedRemoteModel.id}`
    };
  }

  function getSelectedModelConfig() {
    if (getSelectedInferenceSource() === OPENROUTER_SOURCE_ID) {
      return getSelectedOpenRouterModelConfig();
    }

    const modelSelect = document.getElementById('model-select');
    const quantSelect = document.getElementById('quant-select');
    const defaultModel = getDefaultModel();
    const storedModelId = getStoredValue(storageKeys.modelId);
    const preferredModelId = modelSelect?.value || storedModelId || defaultModel?.id || null;
    const modelsConfig = getModelsConfig();
    const selectedModel = modelsConfig.find(model => model.id === preferredModelId) || defaultModel;

    if (!selectedModel) {
      return null;
    }

    const defaultQuant = getDefaultQuant(selectedModel);
    const preferredQuantId = quantSelect?.value || (storedModelId === selectedModel.id ? getStoredValue(storageKeys.quantId) : null);
    const selectedQuant = (selectedModel.quantizations || []).find(quant => quant.id === preferredQuantId) || defaultQuant;
    if (!selectedQuant) {
      return null;
    }

    return {
      ...selectedModel,
      provider: LOCAL_SOURCE_ID,
      selectedQuant,
      thinkingEnabled: isThinkingModeEnabled(),
      dtype: selectedQuant.dtype || null,
      dtypeMap: selectedQuant.dtype_map || null,
      estimatedDownloadMb: selectedQuant.estimated_download_mb ?? null,
      displayName: `${selectedModel.name} (${selectedQuant.name})`,
      signature: `${selectedModel.id}:${selectedQuant.id}`
    };
  }

  function updateOpenRouterStatus() {
    const statusEl = document.getElementById('online-status');
    if (!statusEl) {
      return;
    }

    const providerConfig = getOpenRouterProviderConfig();
    const activeRemoteModel = appState.activeModelConfig?.provider === OPENROUTER_SOURCE_ID && appState.generator;
    const lastMeta = appState.lastOnlineResponseMeta || null;

    if (!providerConfig) {
      statusEl.textContent = 'Le service IA en ligne n est pas disponible dans le catalogue local.';
      return;
    }

    if (!String(providerConfig.api_base_url || '').trim()) {
      statusEl.textContent = 'Configurez d abord l URL du Worker Cloudflare dans le catalogue pour activer l IA en ligne.';
      return;
    }

    if (activeRemoteModel) {
      const providerLabel = lastMeta?.provider && lastMeta?.model
        ? `Dernier service: ${lastMeta.provider} · ${lastMeta.model}.`
        : 'Service prete.';
      statusEl.textContent = `${providerLabel} Les questions exactes restent deterministes et seules les analyses envoient un contexte court hors du navigateur.`;
      return;
    }

    const selectedModel = getSelectedOpenRouterModelConfig();
    statusEl.textContent = selectedModel
      ? `IA en ligne par defaut: ${selectedModel.name}. Les questions exactes restent locales; seules les analyses enverront un contexte court hors du navigateur.`
      : 'IA en ligne par defaut. Les questions exactes restent locales; seules les analyses enverront un contexte court hors du navigateur.';
  }

  function syncSourceSpecificControls() {
    const localModelCard = document.getElementById('local-model-card');
    const localQuantCard = document.getElementById('local-quant-card');
    const remoteModelCard = document.getElementById('openrouter-model-card');
    const remoteApiCard = document.getElementById('openrouter-api-card');
    const onlineServiceCard = document.getElementById('online-service-card');
    const loadBtn = document.getElementById('load-model-btn');
    const source = getSelectedInferenceSource();
    const isRemoteSource = source === OPENROUTER_SOURCE_ID;

    if (localModelCard) {
      localModelCard.hidden = isRemoteSource;
    }

    if (localQuantCard) {
      localQuantCard.hidden = isRemoteSource;
    }

    if (remoteModelCard) {
      remoteModelCard.hidden = true;
    }

    if (remoteApiCard) {
      remoteApiCard.hidden = true;
    }

    if (onlineServiceCard) {
      onlineServiceCard.hidden = !isRemoteSource;
    }

    if (!isRemoteSource) {
      closeOpenRouterPicker({
        resetSearch: true,
        skipRender: true
      });
    }

    if (loadBtn) {
      loadBtn.hidden = isRemoteSource;
      loadBtn.textContent = 'Charger IA locale';
      loadBtn.disabled = !isRemoteSource && !hasWebGPU();
    }

    if (isRemoteSource) {
      void ensureOpenRouterCatalogLoaded();
    }

    syncThinkingAvailability();
    updateOpenRouterStatus();
  }

  function updateAdvancedModelPreview(modelConfig = getSelectedModelConfig()) {
    const summaryEl = document.getElementById('model-settings-summary');
    if (summaryEl) {
      if (!modelConfig) {
        summaryEl.textContent = 'Profil IA indisponible';
        summaryEl.title = 'Configuration IA indisponible';
        summaryEl.classList.remove('experimental');
      } else if (modelConfig.provider === OPENROUTER_SOURCE_ID) {
        summaryEl.textContent = `IA en ligne · ${modelConfig.name || 'par defaut'}`;
        summaryEl.title = `${modelConfig.displayName || 'IA en ligne'} · service distant par defaut`;
        summaryEl.classList.toggle('experimental', modelConfig.status === 'experimental');
      } else {
        const summaryParts = [
          modelConfig.name || 'Modele',
          modelConfig.selectedQuant?.name || modelConfig.selectedQuant?.id || null
        ];

        if (resolveThinkingModeFlag(modelConfig)) {
          summaryParts.push('thinking');
        }

        summaryEl.textContent = summaryParts.filter(Boolean).join(' · ');
        summaryEl.title = `${modelConfig.displayName || modelConfig.name || 'Modele'} · ${resolveThinkingModeFlag(modelConfig) ? 'raisonnement active' : 'mode standard'}`;
        summaryEl.classList.toggle('experimental', modelConfig.status === 'experimental');
      }
    }

    const modelNameEl = document.getElementById('advanced-selected-model');
    const sizeEl = document.getElementById('advanced-selected-size');
    const notesEl = document.getElementById('advanced-selected-notes');
    const statusChip = document.getElementById('advanced-status-chip');
    const runtimeChip = document.getElementById('advanced-runtime-chip');
    const thinkingChip = document.getElementById('advanced-thinking-chip');

    if (!modelNameEl || !sizeEl || !notesEl || !statusChip || !runtimeChip || !thinkingChip) {
      return;
    }

    if (!modelConfig) {
      modelNameEl.textContent = 'Modèle non sélectionné';
      sizeEl.textContent = 'Taille à mesurer';
      notesEl.textContent = 'Sélectionnez un profil pour afficher son résumé.';
      statusChip.textContent = 'stable';
      statusChip.classList.remove('experimental');
      runtimeChip.textContent = 'runtime stable';
      thinkingChip.textContent = 'standard';
      return;
    }

    if (modelConfig.provider === OPENROUTER_SOURCE_ID) {
      modelNameEl.textContent = modelConfig.displayName || 'IA en ligne';
      sizeEl.textContent = buildOpenRouterPricingSummary(modelConfig);
      notesEl.textContent = modelConfig.notes || 'Service distant par defaut.';
      statusChip.textContent = modelConfig.status === 'experimental' ? 'expérimental' : 'stable';
      runtimeChip.textContent = 'service distant';
      thinkingChip.textContent = 'sortie finale';
      statusChip.classList.toggle('experimental', modelConfig.status === 'experimental');
      runtimeChip.classList.add('experimental');
      return;
    }

    const hasExperimentalRuntime = modelConfig.runtime === 'qwen3_5_low_level';
    const hasExperimentalStatus = modelConfig.status === 'experimental';
    const runtimeLabel = hasExperimentalRuntime ? 'runtime expérimental' : 'runtime stable';
    const statusLabel = hasExperimentalStatus ? 'expérimental' : 'stable';

    modelNameEl.textContent = modelConfig.displayName || modelConfig.name || 'Modèle';
    sizeEl.textContent = formatDownloadSize(modelConfig.estimatedDownloadMb);
    notesEl.textContent = modelConfig.notes || 'Aucune note spécifique.';
    statusChip.textContent = statusLabel;
    runtimeChip.textContent = runtimeLabel;
    thinkingChip.textContent = resolveThinkingModeFlag(modelConfig) ? 'thinking activé' : 'standard';

    statusChip.classList.toggle('experimental', hasExperimentalStatus);
    runtimeChip.classList.toggle('experimental', hasExperimentalRuntime);
  }

  function updateActiveModelBadge(modelConfig) {
    const activeName = document.getElementById('active-model-name');
    const badge = document.getElementById('active-model-badge');
    const loadBtn = document.getElementById('load-model-btn');
    const selectedSource = getSelectedInferenceSource();

    if (!modelConfig) {
      const selectedModelConfig = getSelectedModelConfig();
      const defaultModel = getDefaultModel();
      const defaultQuant = defaultModel ? getDefaultQuant(defaultModel) : null;

      let fallbackTitle = 'Aucun modele IA disponible';
      if (selectedSource === OPENROUTER_SOURCE_ID) {
        fallbackTitle = selectedModelConfig
          ? `Configuration activable: ${selectedModelConfig.displayName}`
          : 'Configuration activable: IA en ligne';
      } else if (selectedModelConfig) {
        fallbackTitle = `Configuration sélectionnée: ${selectedModelConfig.displayName}`;
      } else if (defaultModel && defaultQuant) {
        fallbackTitle = `Configuration chargeable: ${defaultModel.name} (${defaultQuant.name})`;
      }

      if (activeName) {
        if (selectedSource === OPENROUTER_SOURCE_ID && selectedModelConfig) {
          activeName.textContent = selectedModelConfig.displayName;
          badge?.classList.add('experimental');
        } else if (defaultModel && defaultQuant) {
          activeName.textContent = `${defaultModel.name} (${defaultQuant.name})`;
          badge?.classList.remove('experimental');
        } else {
          activeName.textContent = 'Aucun modele';
          badge?.classList.remove('experimental');
        }
      }

      if (loadBtn) {
        loadBtn.title = fallbackTitle;
      }

      updateChatCapabilitiesBanner();
      return;
    }

    if (activeName) {
      const modeLabel = modelConfig.provider === OPENROUTER_SOURCE_ID
        ? 'en ligne'
        : resolveThinkingModeFlag(modelConfig) ? 'thinking' : 'non-thinking';
      activeName.textContent = `${modelConfig.displayName} · ${modeLabel}`;
      badge?.classList.toggle('experimental', modelConfig.status === 'experimental');
    }

    if (loadBtn) {
      loadBtn.title = `Configuration active: ${modelConfig.displayName}`;
    }

    updateChatCapabilitiesBanner();
  }

  function updateModelSelectionSummary() {
    syncSourceSpecificControls();
    updateAdvancedModelPreview();
    updateOpenRouterModelSummary();
    updateActiveModelBadge(appState.activeModelConfig);
    syncChatAvailability?.();
  }

  function populateQuantSelect() {
    const modelSelect = document.getElementById('model-select');
    const quantSelect = document.getElementById('quant-select');
    const modelsConfig = getModelsConfig();
    const selectedModel = modelsConfig.find(model => model.id === modelSelect?.value);

    if (!quantSelect) {
      return;
    }

    quantSelect.innerHTML = '';

    if (!selectedModel) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Aucune option';
      quantSelect.appendChild(option);
      updateModelSelectionSummary();
      return;
    }

    const storedModelId = getStoredValue(storageKeys.modelId);
    const storedQuantId = storedModelId === selectedModel.id ? getStoredValue(storageKeys.quantId) : null;
    const defaultQuant = (selectedModel.quantizations || []).find(quant => quant.default) || selectedModel.quantizations?.[0];

    (selectedModel.quantizations || []).forEach(quant => {
      const option = document.createElement('option');
      option.value = quant.id;
      option.textContent = `${quant.name} · ${formatDownloadSize(quant.estimated_download_mb ?? null)}`;
      quantSelect.appendChild(option);
    });

    quantSelect.value = storedQuantId && selectedModel.quantizations.some(quant => quant.id === storedQuantId)
      ? storedQuantId
      : (defaultQuant?.id || '');

    setStoredValue(storageKeys.modelId, selectedModel.id);
    setStoredValue(storageKeys.quantId, quantSelect.value);
    updateModelSelectionSummary();
  }

  function populateModelSelect() {
    const modelSelect = document.getElementById('model-select');
    const modelsConfig = getModelsConfig();
    const preferredModelId = getStoredValue(storageKeys.modelId);
    const selectedModel = modelsConfig.find(model => model.id === preferredModelId) || getDefaultModel();

    if (modelSelect) {
      modelSelect.innerHTML = '';

      const stableGroup = document.createElement('optgroup');
      stableGroup.label = 'Modeles stables';

      const experimentalGroup = document.createElement('optgroup');
      experimentalGroup.label = 'Modeles experimentaux';

      modelsConfig.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;

        if (model.status === 'experimental') {
          experimentalGroup.appendChild(option);
        } else {
          stableGroup.appendChild(option);
        }
      });

      if (stableGroup.children.length > 0) {
        modelSelect.appendChild(stableGroup);
      }

      if (experimentalGroup.children.length > 0) {
        modelSelect.appendChild(experimentalGroup);
      }

      if (selectedModel) {
        modelSelect.value = selectedModel.id;
      }
    }

    populateInferenceSourceSelect();
    populateOpenRouterModelSelect();
    loadOpenRouterCredentialsIntoUi();
    populateQuantSelect();
    updateModelSelectionSummary();
  }

  async function activateOpenRouterFromUi() {
    const modelConfig = getSelectedModelConfig();

    if (!modelConfig || modelConfig.provider !== OPENROUTER_SOURCE_ID) {
      addSystemMessage('Selectionnez un profil IA en ligne valide avant activation.');
      return false;
    }

    if (!modelConfig.apiKey) {
      addSystemMessage('Ajoutez une cle API du service en ligne avant d activer l analyse distante.');
      return false;
    }

    const pricingSummary = buildOpenRouterPricingSummary(modelConfig);
    const pricingNotice = modelConfig.priceStatus === 'free'
      ? 'Modele gratuit selon le catalogue du service en ligne.'
      : modelConfig.priceStatus === 'variable'
        ? 'Tarif variable selon le service en ligne. Verifiez bien le modele avant envoi.'
        : `Modele payant: ${pricingSummary}.`;

    const confirmed = globalThis.confirm?.(
      `Activer l IA en ligne avec ${modelConfig.name} ?\n\n${pricingNotice}\nSeules les analyses enverront un contexte court vers le Worker Cloudflare.\nLes questions exactes restent deterministes dans l application.\nVotre cle API restera locale a cet appareil uniquement si vous choisissez de la memoriser.`
    );

    if (confirmed === false) {
      return false;
    }

    persistOpenRouterCredentials({
      apiKey: modelConfig.apiKey,
      remember: isOpenRouterRememberKeyEnabled()
    });

    await initAI(modelConfig);
    updateOpenRouterStatus();
    return true;
  }

  function setupModelLoadUI() {
    const sourceSelect = document.getElementById('ai-source-select');
    const modelSelect = document.getElementById('model-select');
    const quantSelect = document.getElementById('quant-select');
    const openRouterModelSelect = document.getElementById('openrouter-model-select');
    const openRouterModelTrigger = document.getElementById('openrouter-model-trigger');
    const openRouterModelSearch = document.getElementById('openrouter-model-search');
    const openRouterPickerShell = document.querySelector('#openrouter-model-card .openrouter-picker-shell');
    const openRouterFilterGroup = document.getElementById('openrouter-filter-group');
    const openRouterDetailsToggle = document.getElementById('openrouter-model-details-toggle');
    const openRouterApiKeyInput = document.getElementById('openrouter-api-key');
    const openRouterRememberToggle = document.getElementById('openrouter-remember-key');
    const openRouterClearKeyBtn = document.getElementById('openrouter-clear-key-btn');
    const loadBtn = document.getElementById('load-model-btn');
    const cancelBtn = document.getElementById('cancel-consent-btn');
    const confirmBtn = document.getElementById('confirm-consent-btn');
    const overlay = document.getElementById('model-consent-overlay');
    const toolbarShell = document.querySelector('.model-toolbar-shell');
    const settingsToggleBtn = document.getElementById('model-settings-toggle');
    const closeSettingsBtn = document.getElementById('close-advanced-options-btn');
    const thinkingToggle = document.getElementById('thinking-mode-toggle');
    const semanticToggle = document.getElementById('semantic-rag-toggle');
    const semanticModeSelect = document.getElementById('semantic-rag-mode-select');

    const storedThinkingMode = getStoredValue(storageKeys.thinkingMode) === 'true';
    const storedSemanticRagEnabled = getStoredValue(storageKeys.semanticRagEnabled) === 'true';
    const storedSemanticRagMode = getStoredValue(storageKeys.semanticRagMode) || 'single_vector';

    setAdvancedOptionsOpen(false);
    setThinkingMode(storedThinkingMode, { persist: false });
    setSemanticRagEnabled(storedSemanticRagEnabled, { persist: false, refreshSummary: false });
    setSemanticRagMode(storedSemanticRagMode, { persist: false, refreshSummary: false });
    loadOpenRouterCredentialsIntoUi();
    syncSourceSpecificControls();

    if (settingsToggleBtn) {
      settingsToggleBtn.addEventListener('click', event => {
        event.stopPropagation();
        const nextOpenState = !isAdvancedOptionsOpen();
        setAdvancedOptionsOpen(nextOpenState);
        if (nextOpenState) {
          void ensureSemanticRagUiReady();
        }
      });
    }

    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', () => {
        setAdvancedOptionsOpen(false);
      });
    }

    if (sourceSelect) {
      sourceSelect.addEventListener('change', async () => {
        setStoredValue(storageKeys.inferenceSource, sourceSelect.value);
        const nextProvider = sourceSelect.value === OPENROUTER_SOURCE_ID ? OPENROUTER_SOURCE_ID : LOCAL_SOURCE_ID;
        const activeProvider = appState.activeModelConfig?.provider || null;
        if (activeProvider && activeProvider !== nextProvider) {
          await releaseCurrentModel?.();
        }
        syncSourceSpecificControls();
        if (sourceSelect.value === OPENROUTER_SOURCE_ID) {
          await ensureOpenRouterCatalogLoaded();
        }
        updateModelSelectionSummary();
      });
    }

    if (thinkingToggle) {
      thinkingToggle.addEventListener('change', () => {
        setThinkingMode(thinkingToggle.checked);
        updateActiveModelBadge(appState.activeModelConfig);
      });
    }

    if (semanticToggle) {
      semanticToggle.addEventListener('change', async () => {
        await ensureSemanticRagUiReady();
        if (semanticToggle.checked) {
          const activated = await activateSemanticRagFromUi();
          if (!activated) {
            semanticToggle.checked = false;
          }
          await updateSemanticRagSummary();
          return;
        }

        await releaseSemanticRag?.();
        setSemanticRagEnabled(false);
        await updateSemanticRagSummary();
      });
    }

    if (semanticModeSelect) {
      semanticModeSelect.addEventListener('change', async () => {
        await ensureSemanticRagUiReady();
        setSemanticRagMode(semanticModeSelect.value);
        await releaseSemanticRag?.();
        await updateSemanticRagSummary();
      });
    }

    modelSelect?.addEventListener('change', () => {
      populateQuantSelect();
    });

    quantSelect?.addEventListener('change', () => {
      setStoredValue(storageKeys.modelId, modelSelect.value);
      setStoredValue(storageKeys.quantId, quantSelect.value);
      updateModelSelectionSummary();
    });

    openRouterModelTrigger?.addEventListener('click', () => {
      if (openRouterPickerState.isOpen) {
        closeOpenRouterPicker();
        return;
      }

      openOpenRouterPicker();
    });

    openRouterModelTrigger?.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!openRouterPickerState.isOpen) {
          openOpenRouterPicker();
          return;
        }

        setOpenRouterActiveIndex(openRouterPickerState.activeIndex + 1, { scroll: true });
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (openRouterPickerState.isOpen) {
          closeOpenRouterPicker();
          return;
        }

        openOpenRouterPicker();
      }
    });

    openRouterModelSelect?.addEventListener('change', () => {
      setStoredValue(storageKeys.openRouterModelId, openRouterModelSelect.value);
      openRouterPickerState.detailsExpanded = false;
      updateOpenRouterModelSummary();
      renderOpenRouterModelResults({ resetActive: true });
      updateModelSelectionSummary();
    });

    openRouterModelSearch?.addEventListener('input', () => {
      openRouterCatalogState.searchQuery = openRouterModelSearch.value || '';
      renderOpenRouterModelResults({ resetActive: true });
    });

    openRouterModelSearch?.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!openRouterPickerState.isOpen) {
          openOpenRouterPicker();
          return;
        }

        setOpenRouterActiveIndex(openRouterPickerState.activeIndex + 1, { scroll: true });
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!openRouterPickerState.isOpen) {
          openOpenRouterPicker();
          return;
        }

        setOpenRouterActiveIndex(openRouterPickerState.activeIndex - 1, { scroll: true });
        return;
      }

      if (event.key === 'Enter') {
        const modelId = openRouterPickerState.flatModelIds[openRouterPickerState.activeIndex];
        if (!modelId) {
          return;
        }

        event.preventDefault();
        selectOpenRouterModel(modelId);
        return;
      }

      if (event.key === 'Escape' && openRouterPickerState.isOpen) {
        event.preventDefault();
        closeOpenRouterPicker({
          focusTrigger: true
        });
      }
    });

    openRouterFilterGroup?.addEventListener('click', event => {
      const button = event.target instanceof Element
        ? event.target.closest('[data-openrouter-filter]')
        : null;
      if (!button) {
        return;
      }

      const nextFilter = button.dataset.openrouterFilter;
      if (!OPENROUTER_FILTER_IDS.has(nextFilter)) {
        return;
      }

      openRouterCatalogState.filter = nextFilter;
      renderOpenRouterModelResults({ resetActive: true });
      openRouterModelSearch?.focus();
    });

    openRouterDetailsToggle?.addEventListener('click', () => {
      openRouterPickerState.detailsExpanded = !openRouterPickerState.detailsExpanded;
      syncOpenRouterDetailsUi();
    });

    openRouterApiKeyInput?.addEventListener('input', () => {
      updateOpenRouterStatus();
    });

    openRouterRememberToggle?.addEventListener('change', () => {
      persistOpenRouterCredentials({
        apiKey: getOpenRouterApiKey(),
        remember: openRouterRememberToggle.checked
      });
      updateOpenRouterStatus();
    });

    openRouterClearKeyBtn?.addEventListener('click', () => {
      clearOpenRouterCredentials();
      updateOpenRouterStatus();
    });

    loadBtn.addEventListener('click', async () => {
      setAdvancedOptionsOpen(false);

      if (getSelectedInferenceSource() === OPENROUTER_SOURCE_ID) {
        await activateOpenRouterFromUi();
        return;
      }

      if (!hasWebGPU()) {
        addSystemMessage('WebGPU n\'est pas disponible sur cet appareil. Le chat IA reste desactive.');
        return;
      }

      const modelConfig = getSelectedModelConfig();
      if (!modelConfig) {
        addSystemMessage('Selectionnez un modele valide avant de lancer le chargement.');
        return;
      }

      consentModal.showConsentModal(modelConfig);
    });

    cancelBtn?.addEventListener('click', consentModal.hideConsentModal);
    overlay?.addEventListener('click', event => {
      if (event.target === overlay) {
        consentModal.hideConsentModal();
      }
    });

    confirmBtn?.addEventListener('click', async () => {
      if (!appState.pendingModelConfig) {
        return;
      }

      setAdvancedOptionsOpen(false);
      await initAI(appState.pendingModelConfig);
    });

    document.addEventListener('click', event => {
      if (openRouterPickerState.isOpen && openRouterPickerShell && !openRouterPickerShell.contains(event.target)) {
        closeOpenRouterPicker({
          skipRender: true
        });
      }

      if (!isAdvancedOptionsOpen()) {
        return;
      }

      if (toolbarShell && !toolbarShell.contains(event.target)) {
        setAdvancedOptionsOpen(false);
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && openRouterPickerState.isOpen) {
        event.preventDefault();
        closeOpenRouterPicker({
          focusTrigger: true
        });
        return;
      }

      if (event.key === 'Escape' && isAdvancedOptionsOpen()) {
        setAdvancedOptionsOpen(false);
      }
    });

    updateModelSelectionSummary();
    renderOpenRouterModelResults();
    updateChatCapabilitiesBanner();
  }

  return {
    getDefaultModel,
    getDefaultQuant,
    getSelectedInferenceSource,
    isAdvancedOptionsOpen,
    isThinkingModeEnabled,
    isSemanticRagEnabled,
    getSemanticRagMode,
    resolveThinkingModeFlag,
    syncActiveModelThinkingState,
    setAdvancedOptionsOpen,
    setThinkingMode,
    setSemanticRagEnabled,
    setSemanticRagMode,
    getSelectedModelConfig,
    updateAdvancedModelPreview,
    updateModelSelectionSummary,
    updateSemanticRagSummary,
    populateSemanticRagModeSelect,
    populateQuantSelect,
    populateModelSelect,
    updateActiveModelBadge,
    setupModelLoadUI
  };
}
