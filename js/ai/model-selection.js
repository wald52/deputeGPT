export function createModelSelectionController({
  appState,
  getModelsConfig,
  defaultModelId,
  defaultQuantId,
  getStoredValue,
  setStoredValue,
  storageKeys,
  formatDownloadSize,
  hasWebGPU,
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
    if (!model || !model.quantizations) return null;
    return model.quantizations.find(q => q.id === defaultQuantId) || model.quantizations.find(q => q.default) || model.quantizations[0];
  }

  function isAdvancedOptionsOpen() {
    const options = document.getElementById('advanced-options');
    return Boolean(options && !options.hidden);
  }

  function isThinkingModeEnabled() {
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

  function resolveThinkingModeFlag(modelConfig = null, explicitValue) {
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
      thinkingEnabled: isThinkingModeEnabled()
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
    if (toggle) {
      toggle.checked = Boolean(enabled);
    }

    if (persist) {
      setStoredValue(storageKeys.thinkingMode, enabled ? 'true' : 'false');
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

  function getSelectedModelConfig() {
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
      selectedQuant,
      thinkingEnabled: isThinkingModeEnabled(),
      dtype: selectedQuant.dtype || null,
      dtypeMap: selectedQuant.dtype_map || null,
      estimatedDownloadMb: selectedQuant.estimated_download_mb ?? null,
      displayName: `${selectedModel.name} (${selectedQuant.name})`,
      signature: `${selectedModel.id}:${selectedQuant.id}`
    };
  }

  function updateAdvancedModelPreview(modelConfig = getSelectedModelConfig()) {
    const summaryEl = document.getElementById('model-settings-summary');
    if (summaryEl) {
      if (!modelConfig) {
        summaryEl.textContent = 'Profil IA indisponible';
        summaryEl.title = 'Configuration IA indisponible';
        summaryEl.classList.remove('experimental');
      } else {
        const summaryParts = [
          modelConfig.name || 'Modele',
          modelConfig.selectedQuant?.name || modelConfig.selectedQuant?.id || null
        ];

        if (resolveThinkingModeFlag(modelConfig)) {
          summaryParts.push('thinking');
        }

        summaryEl.textContent = summaryParts.filter(Boolean).join(' · ');
        summaryEl.title = `${modelConfig.displayName || modelConfig.name || 'Modele'} · ${resolveThinkingModeFlag(modelConfig) ? 'raisonnement activé' : 'mode standard'}`;
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

    if (!modelConfig) {
      const selectedModelConfig = getSelectedModelConfig();
      const defaultModel = getDefaultModel();
      const defaultQuant = defaultModel ? getDefaultQuant(defaultModel) : null;
      const fallbackTitle = selectedModelConfig
        ? `Configuration sélectionnée: ${selectedModelConfig.displayName}`
        : defaultModel && defaultQuant
          ? `Configuration chargeable: ${defaultModel.name} (${defaultQuant.name})`
          : 'Aucun modele IA disponible';

      if (activeName) {
        if (defaultModel && defaultQuant) {
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
      const modeLabel = resolveThinkingModeFlag(modelConfig) ? 'thinking' : 'non-thinking';
      activeName.textContent = `${modelConfig.displayName} · ${modeLabel}`;
      badge?.classList.toggle('experimental', modelConfig.status === 'experimental');
    }

    if (loadBtn) {
      loadBtn.title = `Configuration active: ${modelConfig.displayName}`;
    }

    updateChatCapabilitiesBanner();
  }

  function updateModelSelectionSummary() {
    updateAdvancedModelPreview();
    updateActiveModelBadge(appState.activeModelConfig);
  }

  function populateQuantSelect() {
    const modelSelect = document.getElementById('model-select');
    const quantSelect = document.getElementById('quant-select');
    const modelsConfig = getModelsConfig();
    const selectedModel = modelsConfig.find(model => model.id === modelSelect.value);

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

    populateQuantSelect();
  }

  function setupModelLoadUI() {
    const modelSelect = document.getElementById('model-select');
    const quantSelect = document.getElementById('quant-select');
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

    if (!hasWebGPU()) {
      loadBtn.disabled = true;
    }

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

    modelSelect.addEventListener('change', () => {
      populateQuantSelect();
    });

    quantSelect.addEventListener('change', () => {
      setStoredValue(storageKeys.modelId, modelSelect.value);
      setStoredValue(storageKeys.quantId, quantSelect.value);
      updateModelSelectionSummary();
    });

    loadBtn.addEventListener('click', () => {
      setAdvancedOptionsOpen(false);

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

    cancelBtn.addEventListener('click', consentModal.hideConsentModal);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        consentModal.hideConsentModal();
      }
    });

    confirmBtn.addEventListener('click', async () => {
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
