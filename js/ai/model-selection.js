const LOCAL_SOURCE_ID = 'local';
const OPENROUTER_SOURCE_ID = 'openrouter';

const DEFAULT_THINKING_HELP_TEXT = 'Plus lent, reserve aux usages avances. Le raisonnement interne reste masque dans l interface.';
const REMOTE_THINKING_HELP_TEXT = 'Le mode OpenRouter gratuit reste en sortie finale uniquement. Le raisonnement interne n est jamais affiche.';

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
  defaultModelId,
  defaultQuantId,
  getStoredValue,
  setStoredValue,
  storageKeys,
  formatDownloadSize,
  hasWebGPU,
  syncChatAvailability,
  updateChatCapabilitiesBanner,
  addSystemMessage,
  initAI,
  getSemanticSearchConfig,
  getSemanticSearchModes,
  getSemanticRagStatus,
  loadSemanticRag,
  releaseSemanticRag,
  consentModal
}) {
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
    return providers.find(provider => provider.id === OPENROUTER_SOURCE_ID) || providers[0] || null;
  }

  function getDefaultOpenRouterModel(providerConfig = getOpenRouterProviderConfig()) {
    const models = Array.isArray(providerConfig?.models) ? providerConfig.models : [];
    return models.find(model => model.default) || models[0] || null;
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
    const preferredSource = sourceSelect?.value || storedSource || LOCAL_SOURCE_ID;

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
    const isEnabled = Boolean(enabled);

    if (options) {
      options.hidden = !isEnabled;
      options.setAttribute('aria-hidden', isEnabled ? 'false' : 'true');
    }

    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', isEnabled ? 'true' : 'false');
      toggleBtn.classList.toggle('active', isEnabled);
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

  function setSemanticRagEnabled(enabled, { persist = true } = {}) {
    const toggle = document.getElementById('semantic-rag-toggle');
    if (toggle) {
      toggle.checked = Boolean(enabled);
    }

    if (persist) {
      setStoredValue(storageKeys.semanticRagEnabled, enabled ? 'true' : 'false');
    }

    void updateSemanticRagSummary();
  }

  function setSemanticRagMode(mode, { persist = true } = {}) {
    const nextMode = mode || 'single_vector';
    const select = document.getElementById('semantic-rag-mode-select');
    if (select) {
      select.value = nextMode;
    }

    if (persist) {
      setStoredValue(storageKeys.semanticRagMode, nextMode);
    }

    void updateSemanticRagSummary();
  }

  function syncThinkingAvailability() {
    const toggle = document.getElementById('thinking-mode-toggle');
    const help = document.getElementById('thinking-help');
    if (!toggle || !help) {
      return;
    }

    const isRemoteSource = getSelectedInferenceSource() === OPENROUTER_SOURCE_ID;

    if (isRemoteSource) {
      toggle.checked = false;
      toggle.disabled = true;
      help.textContent = REMOTE_THINKING_HELP_TEXT;
      return;
    }

    toggle.disabled = false;
    help.textContent = DEFAULT_THINKING_HELP_TEXT;

    const storedThinkingMode = getStoredValue(storageKeys.thinkingMode) === 'true';
    toggle.checked = storedThinkingMode;
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

  async function updateSemanticRagSummary() {
    const helperEl = document.getElementById('semantic-rag-helper');
    const sizeEl = document.getElementById('semantic-rag-size');
    const statusEl = document.getElementById('semantic-rag-status');
    const loadBtn = document.getElementById('semantic-rag-load-btn');
    const toggle = document.getElementById('semantic-rag-toggle');
    const modeSelect = document.getElementById('semantic-rag-mode-select');
    if (!helperEl || !sizeEl || !statusEl || !loadBtn || !toggle || !modeSelect) {
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
    const modeLabel = config?.label || selectedMode;

    if (!config?.available) {
      helperEl.textContent = `Mode ${modeLabel} non publie pour le moment. Le chemin exact reste lexical et le mode single-vector demeure la voie stable.`;
      sizeEl.textContent = 'Artefact semantique indisponible';
      statusEl.textContent = 'Selectionnez un autre mode ou restez en lexical uniquement.';
      toggle.disabled = true;
      loadBtn.textContent = 'Indisponible';
      loadBtn.disabled = true;
      return;
    }

    helperEl.textContent = `Reranking ${modeLabel} apres la recherche lexicale. Modele dedie: ${semanticModelLabel}.`;
    sizeEl.textContent = `Telechargement estime: ${totalLabel} (index: ${artifactLabel})`;
    toggle.disabled = false;

    if (runtimeStatus.status === 'loading') {
      statusEl.textContent = `Chargement local du mode ${modeLabel} en cours.`;
      loadBtn.textContent = 'Chargement...';
      loadBtn.disabled = true;
      return;
    }

    if (runtimeStatus.ready && runtimeStatus.modeId === config.modeId) {
      statusEl.textContent = `Actif pour le reranking d analyse en ${modeLabel}. Le chemin exact reste lexical par defaut.`;
      loadBtn.textContent = 'Pret';
      loadBtn.disabled = true;
      return;
    }

    if (!hasWebGPU()) {
      statusEl.textContent = 'WebGPU absent: ce mode semantique local experimental reste indisponible.';
      loadBtn.textContent = 'WebGPU requis';
      loadBtn.disabled = true;
      return;
    }

    if (isSemanticRagEnabled()) {
      statusEl.textContent = `Preference active pour ${modeLabel}, mais confirmation requise avant un chargement local sur cet appareil.`;
      loadBtn.textContent = 'Charger';
      loadBtn.disabled = false;
      return;
    }

    statusEl.textContent = `Desactive. Les analyses continuent a utiliser le chemin lexical uniquement tant que ${modeLabel} n est pas charge.`;
    loadBtn.textContent = 'Activer';
    loadBtn.disabled = false;
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

    if (!hasWebGPU()) {
      addSystemMessage('Le RAG semantique local experimental requiert WebGPU sur cet appareil.');
      setSemanticRagEnabled(false);
      return false;
    }

    const confirmed = globalThis.confirm?.(
      `Activer le mode ${config.label || config.modeId} du RAG semantique local ?\n\nModele dedie: ${config.model?.id || config.model?.browserModelId}\nIndex semantique: ${formatDownloadSize(config.artifact?.downloadMb ?? null)}\nTelechargement total estime: ${formatDownloadSize(config.totalEstimatedDownloadMb ?? null)}\n\nLe telechargement n est jamais lance sans votre confirmation.`
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

  function populateInferenceSourceSelect() {
    const sourceSelect = document.getElementById('ai-source-select');
    if (!sourceSelect) {
      return;
    }

    const options = [
      {
        value: LOCAL_SOURCE_ID,
        label: 'Modele local'
      }
    ];

    if (hasOpenRouterProvider()) {
      options.push({
        value: OPENROUTER_SOURCE_ID,
        label: 'OpenRouter'
      });
    }

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
      : LOCAL_SOURCE_ID;

    setStoredValue(storageKeys.inferenceSource, sourceSelect.value);
  }

  function populateOpenRouterModelSelect() {
    const select = document.getElementById('openrouter-model-select');
    if (!select) {
      return;
    }

    const providerConfig = getOpenRouterProviderConfig();
    const remoteModels = Array.isArray(providerConfig?.models) ? providerConfig.models : [];
    const storedModelId = getStoredValue(storageKeys.openRouterModelId);
    const defaultModel = getDefaultOpenRouterModel(providerConfig);
    const selectedModel = remoteModels.find(model => model.id === storedModelId) || defaultModel;

    select.innerHTML = '';

    if (!providerConfig || remoteModels.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Aucun modele distant';
      select.appendChild(option);
      select.disabled = true;
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
    }
  }

  function getSelectedOpenRouterModelConfig() {
    const providerConfig = getOpenRouterProviderConfig();
    if (!providerConfig) {
      return null;
    }

    const remoteModels = Array.isArray(providerConfig.models) ? providerConfig.models : [];
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
      family: providerConfig.name || 'OpenRouter',
      runtime: 'openrouter_remote',
      apiBaseUrl: providerConfig.api_base_url || 'https://openrouter.ai/api/v1',
      providerModelId: selectedRemoteModel.provider_model_id,
      apiKey: getOpenRouterApiKey(),
      estimatedDownloadMb: null,
      supportsThinking: selectedRemoteModel.supports_thinking !== true ? false : true,
      thinkingEnabled: false,
      displayName: `${providerConfig.name || 'OpenRouter'} · ${selectedRemoteModel.name}`,
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
    const statusEl = document.getElementById('openrouter-status');
    const clearKeyBtn = document.getElementById('openrouter-clear-key-btn');
    if (!statusEl) {
      return;
    }

    const providerConfig = getOpenRouterProviderConfig();
    const activeRemoteModel = appState.activeModelConfig?.provider === OPENROUTER_SOURCE_ID && appState.generator;
    const apiKey = getOpenRouterApiKey();
    const remember = isOpenRouterRememberKeyEnabled();

    if (clearKeyBtn) {
      clearKeyBtn.disabled = !apiKey && !getStoredOpenRouterApiKey();
    }

    if (!providerConfig) {
      statusEl.textContent = 'OpenRouter n est pas disponible dans le catalogue local.';
      return;
    }

    if (activeRemoteModel) {
      statusEl.textContent = `Backend distant actif: ${appState.activeModelConfig.displayName}. Les questions exactes restent deterministes.`;
      return;
    }

    if (apiKey) {
      statusEl.textContent = remember
        ? 'Cle API presente et memorisee localement sur cet appareil.'
        : 'Cle API presente pour cette session. Rien n est envoye tant que vous n activez pas OpenRouter.';
      return;
    }

    statusEl.textContent = 'Ajoutez votre cle API OpenRouter. Seules les analyses enverront un contexte court hors du navigateur.';
  }

  function syncSourceSpecificControls() {
    const localModelCard = document.getElementById('local-model-card');
    const localQuantCard = document.getElementById('local-quant-card');
    const remoteModelCard = document.getElementById('openrouter-model-card');
    const remoteApiCard = document.getElementById('openrouter-api-card');
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
      remoteModelCard.hidden = !isRemoteSource;
    }

    if (remoteApiCard) {
      remoteApiCard.hidden = !isRemoteSource;
    }

    if (loadBtn) {
      loadBtn.textContent = isRemoteSource ? 'Activer OpenRouter' : 'Charger IA';
      loadBtn.disabled = isRemoteSource ? !hasOpenRouterProvider() : !hasWebGPU();
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
        summaryEl.textContent = `OpenRouter · ${modelConfig.name || 'gratuit'}`;
        summaryEl.title = `${modelConfig.displayName || 'OpenRouter'} · backend distant optionnel`;
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
      modelNameEl.textContent = modelConfig.displayName || 'OpenRouter';
      sizeEl.textContent = 'Aucun telechargement local';
      notesEl.textContent = modelConfig.notes || 'Backend distant optionnel.';
      statusChip.textContent = modelConfig.status === 'experimental' ? 'expérimental' : 'stable';
      runtimeChip.textContent = 'backend distant';
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
          : 'Configuration activable: OpenRouter';
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
        ? 'distant'
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
      addSystemMessage('Selectionnez un profil OpenRouter valide avant activation.');
      return false;
    }

    if (!modelConfig.apiKey) {
      addSystemMessage('Ajoutez une cle API OpenRouter avant d activer le backend distant.');
      return false;
    }

    const confirmed = globalThis.confirm?.(
      `Activer OpenRouter avec ${modelConfig.name} ?\n\nSeules les analyses enverront un contexte court hors du navigateur.\nLes questions exactes restent deterministes dans l application.\nVotre cle API restera locale a cet appareil uniquement si vous choisissez de la memoriser.`
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
    const semanticLoadBtn = document.getElementById('semantic-rag-load-btn');

    const storedThinkingMode = getStoredValue(storageKeys.thinkingMode) === 'true';
    const storedSemanticRagEnabled = getStoredValue(storageKeys.semanticRagEnabled) === 'true';
    const storedSemanticRagMode = getStoredValue(storageKeys.semanticRagMode) || 'single_vector';

    setAdvancedOptionsOpen(false);
    setThinkingMode(storedThinkingMode, { persist: false });
    setSemanticRagEnabled(storedSemanticRagEnabled, { persist: false });
    setSemanticRagMode(storedSemanticRagMode, { persist: false });
    loadOpenRouterCredentialsIntoUi();
    syncSourceSpecificControls();

    if (settingsToggleBtn) {
      settingsToggleBtn.addEventListener('click', event => {
        event.stopPropagation();
        setAdvancedOptionsOpen(!isAdvancedOptionsOpen());
      });
    }

    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', () => {
        setAdvancedOptionsOpen(false);
      });
    }

    if (sourceSelect) {
      sourceSelect.addEventListener('change', () => {
        setStoredValue(storageKeys.inferenceSource, sourceSelect.value);
        syncSourceSpecificControls();
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
        setSemanticRagMode(semanticModeSelect.value);
        await releaseSemanticRag?.();
        await updateSemanticRagSummary();
      });
    }

    if (semanticLoadBtn) {
      semanticLoadBtn.addEventListener('click', async () => {
        setSemanticRagEnabled(true);
        const activated = await activateSemanticRagFromUi();
        if (!activated) {
          setSemanticRagEnabled(false);
        }
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

    openRouterModelSelect?.addEventListener('change', () => {
      setStoredValue(storageKeys.openRouterModelId, openRouterModelSelect.value);
      updateModelSelectionSummary();
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
      if (!isAdvancedOptionsOpen()) {
        return;
      }

      if (toolbarShell && !toolbarShell.contains(event.target)) {
        setAdvancedOptionsOpen(false);
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && isAdvancedOptionsOpen()) {
        setAdvancedOptionsOpen(false);
      }
    });

    updateModelSelectionSummary();
    void populateSemanticRagModeSelect().then(() => updateSemanticRagSummary());
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
