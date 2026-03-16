export function createModelLoader({
  appState,
  hasWebGPU,
  syncChatAvailability,
  updateActiveModelBadge,
  setStoredValue,
  storageKeys,
  transformersRuntime,
  createPipelineRuntime,
  createQwen3Runtime,
  createQwen35Runtime,
  createOpenRouterRuntime,
  createGeneratorAdapter,
  resolveThinkingModeFlag,
  syncActiveModelThinkingState,
  addSystemMessage
}) {
  async function releaseCurrentModel() {
    if (appState.generator && typeof appState.generator.dispose === 'function') {
      await appState.generator.dispose();
    }

    appState.generator = null;
    appState.activeModelConfig = null;
    updateActiveModelBadge(null);
  }

  async function initAI(modelConfig, ui) {
    const {
      loadButton,
      progressContainer,
      progressBarFill,
      progressText,
      onFinally
    } = ui;

    if (!modelConfig) {
      addSystemMessage('Selectionnez un modele et une quantification valides.');
      return;
    }

    const usesRemoteProvider = modelConfig.runtime === 'openrouter_remote' || modelConfig.provider === 'openrouter';

    if (!usesRemoteProvider && !hasWebGPU()) {
      addSystemMessage('WebGPU n\'est pas disponible sur cet appareil. Le chat IA reste desactive.');
      return;
    }

    loadButton.disabled = true;
    progressContainer.hidden = false;

    const updateProgress = (progressRatio, label) => {
      const safeRatio = Math.max(0, Math.min(1, progressRatio));
      const safePct = Math.round(safeRatio * 100);
      progressBarFill.style.width = `${safePct}%`;
      progressText.textContent = `${label} (${safePct}%)`;
      progressBarFill.parentElement?.setAttribute('aria-valuenow', String(safePct));
    };

    try {
      if (appState.activeModelConfig?.signature === modelConfig.signature && appState.generator) {
        addSystemMessage(`${modelConfig.displayName} est deja actif.`);
        syncChatAvailability();
        return;
      }

      await releaseCurrentModel();

      let runtime;

      if (usesRemoteProvider) {
        updateProgress(0.12, 'Connexion OpenRouter');
        runtime = await createOpenRouterRuntime(modelConfig);
      } else {
        const runtimeChannel = modelConfig.runtime === 'qwen3_5_low_level' ? 'next' : 'stable';
        updateProgress(0.02, runtimeChannel === 'next' ? 'Chargement du runtime experimental' : 'Chargement du runtime stable');
        await transformersRuntime.loadRuntime(runtimeChannel);

        updateProgress(0.08, 'Preparation');
        runtime = modelConfig.runtime === 'qwen3_5_low_level'
          ? await createQwen35Runtime(modelConfig, updateProgress)
          : modelConfig.runtime === 'qwen3_low_level'
            ? await createQwen3Runtime(modelConfig, updateProgress)
            : await createPipelineRuntime(modelConfig, updateProgress);
      }

      appState.generator = createGeneratorAdapter(runtime);
      appState.activeModelConfig = modelConfig;
      syncActiveModelThinkingState();
      updateProgress(1, 'Modele pret');
      updateActiveModelBadge(appState.activeModelConfig);

      if (usesRemoteProvider) {
        setStoredValue(storageKeys.inferenceSource, 'openrouter');
        setStoredValue(storageKeys.openRouterModelId, modelConfig.id);
        addSystemMessage(`Backend distant actif : ${modelConfig.displayName}.`);
      } else {
        setStoredValue(storageKeys.inferenceSource, 'local');
        setStoredValue(storageKeys.modelId, modelConfig.id);
        setStoredValue(storageKeys.quantId, modelConfig.selectedQuant.id);
        setStoredValue(storageKeys.acceptedModelId, modelConfig.id);
        setStoredValue(storageKeys.acceptedQuantId, modelConfig.selectedQuant.id);
        addSystemMessage(`Modele pret : ${modelConfig.displayName} (${resolveThinkingModeFlag(appState.activeModelConfig) ? 'thinking' : 'non-thinking'}).`);
      }

      syncChatAvailability();
    } catch (error) {
      console.error('Erreur de chargement du modele:', error);
      const errorDetail = error?.message || error?.toString?.() || 'erreur inconnue';
      addSystemMessage(`Erreur de chargement : ${errorDetail}`);
      await releaseCurrentModel();
    } finally {
      loadButton.disabled = false;
      progressContainer.hidden = true;
      onFinally?.();
    }
  }

  return {
    initAI,
    releaseCurrentModel
  };
}
