export function createChatAvailabilityController({
  appState,
  hasWebGPU,
  getSelectedInferenceSource,
  resolveThinkingModeFlag,
  updateChatScopeSummary,
  renderQuickActions,
  syncSendButtonState,
  adjustChatInputHeight,
  updateChatEmptyState
}) {
  function updateChatCapabilitiesBanner() {
    const badge = document.getElementById('chat-capabilities');
    if (!badge) {
      return;
    }

    const selectedInferenceSource = typeof getSelectedInferenceSource === 'function'
      ? getSelectedInferenceSource()
      : 'online';

    if (appState.isChatBusy) {
      badge.textContent = 'Analyse en cours... vous pouvez préparer la prochaine question.';
      return;
    }

    if (!appState.currentDepute) {
      badge.textContent = 'Sélectionnez un député pour activer le chat.';
      return;
    }

    if (!appState.currentDepute.votes || appState.currentDepute.votes.length === 0) {
      badge.textContent = 'Aucun vote disponible pour ce député.';
      return;
    }

    if (appState.generator && appState.activeModelConfig) {
      const modeLabel = appState.activeModelConfig.provider === 'online'
        ? 'en ligne'
        : resolveThinkingModeFlag(appState.activeModelConfig) ? 'thinking' : 'non-thinking';
      if (appState.activeModelConfig.provider === 'online' && appState.lastOnlineResponseMeta?.provider) {
        badge.textContent = `IA en ligne active: ${appState.lastOnlineResponseMeta.provider} · ${appState.lastOnlineResponseMeta.model || 'modèle distant'}.`;
        return;
      }

      badge.textContent = `Modèle actif: ${appState.activeModelConfig.displayName} (${modeLabel}).`;
      return;
    }

    if (selectedInferenceSource === 'online') {
      badge.textContent = "Réponses exactes actives. L'analyse IA en ligne est prête dès que vous posez une question interprétative.";
      return;
    }

    if (hasWebGPU()) {
      badge.textContent = "Réponses exactes actives. Chargez un modèle pour l'analyse.";
      return;
    }

    badge.textContent = 'WebGPU absent: mode exact uniquement sur cet appareil.';
  }

  function syncChatAvailability() {
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    if (!userInput || !sendBtn) {
      return;
    }

    updateChatScopeSummary();

    if (!appState.currentDepute) {
      userInput.disabled = true;
      sendBtn.disabled = true;
      userInput.placeholder = 'Choisissez un député pour commencer.';
      updateChatCapabilitiesBanner();
      renderQuickActions();
      updateChatEmptyState();
      return;
    }

    if (!appState.currentDepute.votes || appState.currentDepute.votes.length === 0) {
      userInput.disabled = true;
      sendBtn.disabled = true;
      userInput.placeholder = 'Aucun vote disponible pour ce député.';
      updateChatCapabilitiesBanner();
      renderQuickActions();
      updateChatEmptyState();
      return;
    }

    userInput.disabled = false;
    sendBtn.disabled = false;

    if (appState.generator) {
      userInput.placeholder = 'Posez votre question sur les votes de ce député...';
      updateChatCapabilitiesBanner();
      renderQuickActions();
      syncSendButtonState();
      adjustChatInputHeight(userInput);
      updateChatEmptyState();
      return;
    }

    const selectedInferenceSource = typeof getSelectedInferenceSource === 'function'
      ? getSelectedInferenceSource()
      : 'online';

    if (selectedInferenceSource === 'online') {
      userInput.placeholder = 'Posez votre question ici.';
      updateChatCapabilitiesBanner();
      renderQuickActions();
      syncSendButtonState();
      adjustChatInputHeight(userInput);
      updateChatEmptyState();
      return;
    }

    if (!hasWebGPU()) {
      userInput.placeholder = 'Questions exactes disponibles. Le mode analyse IA requiert WebGPU.';
      updateChatCapabilitiesBanner();
      renderQuickActions();
      syncSendButtonState();
      adjustChatInputHeight(userInput);
      updateChatEmptyState();
      return;
    }

    userInput.placeholder = 'Questions exactes disponibles. Chargez un modèle pour les analyses.';
    updateChatCapabilitiesBanner();
    renderQuickActions();
    syncSendButtonState();
    adjustChatInputHeight(userInput);
    updateChatEmptyState();
  }

  return {
    syncChatAvailability,
    updateChatCapabilitiesBanner
  };
}
