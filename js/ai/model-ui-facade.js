export function createModelUiFacade({
  modelSelection,
  consentModal,
  modelLoader,
  getLoadUi
}) {
  function getSelectedModelConfig() {
    return modelSelection.getSelectedModelConfig();
  }

  function hideConsentModal() {
    return consentModal.hideConsentModal();
  }

  async function initAI(modelConfig = getSelectedModelConfig()) {
    return modelLoader.initAI(modelConfig, {
      ...getLoadUi(),
      onFinally: hideConsentModal
    });
  }

  return {
    getDefaultModel: () => modelSelection.getDefaultModel(),
    getDefaultQuant: model => modelSelection.getDefaultQuant(model),
    getSelectedInferenceSource: () => modelSelection.getSelectedInferenceSource(),
    isAdvancedOptionsOpen: () => modelSelection.isAdvancedOptionsOpen(),
    isThinkingModeEnabled: () => modelSelection.isThinkingModeEnabled(),
    resolveThinkingModeFlag: (modelConfig = null, explicitValue) => modelSelection.resolveThinkingModeFlag(modelConfig, explicitValue),
    syncActiveModelThinkingState: () => modelSelection.syncActiveModelThinkingState(),
    setAdvancedOptionsOpen: enabled => modelSelection.setAdvancedOptionsOpen(enabled),
    setThinkingMode: (enabled, options = {}) => modelSelection.setThinkingMode(enabled, options),
    getSelectedModelConfig,
    updateAdvancedModelPreview: (modelConfig = getSelectedModelConfig()) => modelSelection.updateAdvancedModelPreview(modelConfig),
    updateModelSelectionSummary: () => modelSelection.updateModelSelectionSummary(),
    populateQuantSelect: () => modelSelection.populateQuantSelect(),
    populateModelSelect: () => modelSelection.populateModelSelect(),
    updateActiveModelBadge: modelConfig => modelSelection.updateActiveModelBadge(modelConfig),
    fillConsentModal: modelConfig => consentModal.fillConsentModal(modelConfig),
    showConsentModal: modelConfig => consentModal.showConsentModal(modelConfig),
    hideConsentModal,
    initAI,
    setupModelLoadUI: () => modelSelection.setupModelLoadUI()
  };
}
