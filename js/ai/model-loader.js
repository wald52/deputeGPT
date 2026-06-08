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
  createOnlineRuntime,
  createGeneratorAdapter,
  resolveThinkingModeFlag,
  syncActiveModelThinkingState,
  addSystemMessage
}) {
  async function releaseCurrentModel() {
    if (appState.generator && typeof appState.generator.resetCircuit === 'function') {
      appState.generator.resetCircuit();
    }
    if (appState.generator && typeof appState.generator.dispose === 'function') {
      await appState.generator.dispose();
    }

    appState.generator = null;
    appState.activeModelConfig = null;
    updateActiveModelBadge(null);
  }

  async function initAI(modelConfig, ui, options = {}) {
    const {
      loadButton,
      progressContainer,
      progressBarFill,
      progressText,
      onFinally
    } = ui;
    const { quiet = false } = options;

    if (!modelConfig) {
      if (!quiet) {
        addSystemMessage('Selectionnez un modele et une quantification valides.');
      }
      return;
    }

    const usesRemoteProvider = modelConfig.runtime === 'online_remote' || modelConfig.provider === 'online';

    if (!usesRemoteProvider && !hasWebGPU()) {
      if (!quiet) {
        addSystemMessage('WebGPU n\'est pas disponible sur cet appareil. Le chat IA reste desactive.');
      }
      return;
    }

    if (loadButton) {
      loadButton.disabled = true;
    }
    if (progressContainer) {
      progressContainer.hidden = false;
    }

    const updateProgress = (progressRatio, label) => {
      const safeRatio = Math.max(0, Math.min(1, progressRatio));
      const safePct = Math.round(safeRatio * 100);
      if (progressBarFill) {
        progressBarFill.style.width = `${safePct}%`;
        progressBarFill.parentElement?.setAttribute('aria-valuenow', String(safePct));
      }
      if (progressText) {
        progressText.textContent = `${label} (${safePct}%)`;
      }
    };

    try {
      if (appState.activeModelConfig?.signature === modelConfig.signature && appState.generator) {
        if (!quiet) {
          addSystemMessage(`${modelConfig.displayName} est deja actif.`);
        }
        syncChatAvailability();
        return;
      }

      await releaseCurrentModel();

      let runtime;

      if (usesRemoteProvider) {
        updateProgress(0.12, 'Connexion IA en ligne');
        runtime = await createOnlineRuntime(modelConfig);
      } else {
        updateProgress(0.02, 'Chargement du runtime stable');
        await transformersRuntime.loadRuntime('stable');

        updateProgress(0.08, 'Preparation');
        if (modelConfig.runtime === 'qwen3_low_level') {
          runtime = await createQwen3Runtime(modelConfig, updateProgress);
        } else if (modelConfig.runtime === 'qwen35_low_level') {
          runtime = await createQwen35Runtime(modelConfig, updateProgress);
        } else {
          runtime = await createPipelineRuntime(modelConfig, updateProgress);
        }
      }

      appState.generator = createGeneratorAdapter(runtime);
      appState.activeModelConfig = modelConfig;
      syncActiveModelThinkingState();
      updateProgress(1, 'Modele pret');
      updateActiveModelBadge(appState.activeModelConfig);

      if (usesRemoteProvider) {
        setStoredValue(storageKeys.inferenceSource, 'online');
        if (!quiet) {
          addSystemMessage(`Service IA en ligne actif : ${modelConfig.displayName}.`);
        }
      } else {
        setStoredValue(storageKeys.inferenceSource, 'local');
        setStoredValue(storageKeys.modelId, modelConfig.id);
        setStoredValue(storageKeys.quantId, modelConfig.selectedQuant.id);
        setStoredValue(storageKeys.acceptedModelId, modelConfig.id);
        setStoredValue(storageKeys.acceptedQuantId, modelConfig.selectedQuant.id);
        if (!quiet) {
          addSystemMessage(`Modele pret : ${modelConfig.displayName} (${resolveThinkingModeFlag(appState.activeModelConfig) ? 'thinking' : 'non-thinking'}).`);
        }
      }

      syncChatAvailability();
    } catch (error) {
      console.error('Erreur de chargement du modele:', error);
      const errorDetail = error?.message || error?.toString?.() || 'erreur inconnue';
      if (!quiet) {
        addSystemMessage(`Erreur de chargement : ${errorDetail}`);
      }
      await releaseCurrentModel();
      if (quiet) {
        throw error;
      }
    } finally {
      if (loadButton) {
        loadButton.disabled = false;
      }
      if (progressContainer) {
        progressContainer.hidden = true;
      }
      onFinally?.();
    }
  }

  return {
    initAI,
    releaseCurrentModel
  };
}
