export function createConsentModalController({
  appState,
  formatDownloadSize,
  resolveThinkingModeFlag
}) {
  function fillConsentModal(modelConfig) {
    const modeLabel = resolveThinkingModeFlag(modelConfig) ? 'thinking' : 'non-thinking';
    document.getElementById('consent-model-name').textContent = modelConfig.displayName;
    document.getElementById('consent-model-profile').textContent = `${modelConfig.family} · ${modelConfig.status === 'stable' ? 'stable' : 'experimental'} · ${modeLabel}`;
    document.getElementById('consent-model-size').textContent = formatDownloadSize(modelConfig.estimatedDownloadMb);
    document.getElementById('consent-model-notes').textContent = modelConfig.notes;
  }

  function showConsentModal(modelConfig) {
    appState.pendingModelConfig = modelConfig;
    fillConsentModal(modelConfig);
    const overlay = document.getElementById('model-consent-overlay');
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function hideConsentModal() {
    appState.pendingModelConfig = null;
    const overlay = document.getElementById('model-consent-overlay');
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
  }

  return {
    fillConsentModal,
    showConsentModal,
    hideConsentModal
  };
}
