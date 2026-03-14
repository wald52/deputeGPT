export function createAppBootstrap({
  autoCleanStorage,
  initChatHistory,
  setupSearch,
  setupChat,
  loadDeputesData,
  loadGroupesData,
  loadModelCatalog,
  renderLegend,
  setupHemicycle,
  setupModelLoadUI,
  setupChatHistoryUI,
  updateActiveModelBadge,
  getActiveModelConfig,
  updateModelSelectionSummary,
  syncChatAvailability,
  scheduleSearchIndexWarmup,
  renderQuickActions,
  updateChatEmptyState,
  checkProtocol,
  getDeputesData,
  getStoredValue,
  setStoredValue,
  storageKeys,
  populateModelSelect
}) {
  function syncAcceptedModelSelectionInternal() {
    const acceptedModelId = getStoredValue(storageKeys.acceptedModelId);
    const acceptedQuantId = getStoredValue(storageKeys.acceptedQuantId);
    if (!acceptedModelId || !acceptedQuantId) {
      return;
    }

    setStoredValue(storageKeys.modelId, acceptedModelId);
    setStoredValue(storageKeys.quantId, acceptedQuantId);
    populateModelSelect();
  }

  function validateBootstrapDataInternal() {
    const deputesData = getDeputesData();
    if (!deputesData || deputesData.length === 0) {
      console.error('ERREUR CRITIQUE: aucune donnee de depute chargee.');
      alert('Erreur : impossible de charger la liste des deputes.');
      return;
    }

    console.log(`Donnees chargees : ${deputesData.length} deputes.`);
  }

  async function init() {
    const canContinue = await autoCleanStorage();
    if (!canContinue) {
      return;
    }

    await initChatHistory();

    setupSearch();
    setupChat();

    await Promise.all([
      loadDeputesData(),
      loadGroupesData(),
      loadModelCatalog()
    ]);

    renderLegend();
    await setupHemicycle();
    setupModelLoadUI();
    setupChatHistoryUI();
    updateActiveModelBadge(getActiveModelConfig());
    updateModelSelectionSummary();
    syncChatAvailability();
    scheduleSearchIndexWarmup();
    renderQuickActions();
    updateChatEmptyState();
    checkProtocol();

    validateBootstrapDataInternal();
    syncAcceptedModelSelectionInternal();
  }

  return {
    init
  };
}
