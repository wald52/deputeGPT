export function createAppBootstrap({
  autoCleanStorage,
  setupSearch,
  setupChat,
  loadDeputesData,
  loadGroupesData,
  loadModelCatalog,
  renderLegend,
  setupHemicycle,
  setupModelLoadUI,
  setupResponsiveLayout,
  setupChatHistoryUI,
  updateActiveModelBadge,
  getActiveModelConfig,
  updateModelSelectionSummary,
  syncChatAvailability,
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
      const messagesDiv = document.getElementById('messages');
      const target = messagesDiv?.parentElement || document.body;
      const errorBanner = document.createElement('div');
      errorBanner.style.cssText = 'padding:16px; margin:16px; background:#fdecea; color:#611a15; border-radius:12px; font-size:0.9rem; text-align:center;';
      errorBanner.textContent = 'Erreur critique : impossible de charger la liste des deputes. Verifiez votre connexion et rechargez la page.';
      target.prepend(errorBanner);
      return;
    }

    console.debug(`Donnees chargees : ${deputesData.length} deputes.`);
  }

  async function init() {
    const canContinue = await autoCleanStorage();
    if (!canContinue) {
      return;
    }

    setupSearch();
    setupChat();
    setupModelLoadUI();
    setupChatHistoryUI();
    setupResponsiveLayout?.();
    renderQuickActions();
    updateChatEmptyState();
    checkProtocol();

    await Promise.all([
      loadDeputesData(),
      loadGroupesData(),
      loadModelCatalog()
    ]);

    renderLegend();
    setupHemicycle?.();
    updateActiveModelBadge(getActiveModelConfig());
    updateModelSelectionSummary();
    syncChatAvailability();

    validateBootstrapDataInternal();
    syncAcceptedModelSelectionInternal();
  }

  return {
    init
  };
}
