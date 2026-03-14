export function createChatAvailabilityController({
  appState,
  hasWebGPU,
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

    if (appState.isChatBusy) {
      badge.textContent = 'Analyse en cours... vous pouvez preparer la prochaine question.';
      return;
    }

    if (!appState.currentDepute) {
      badge.textContent = 'Selectionnez un depute pour activer le chat.';
      return;
    }

    if (!appState.currentDepute.votes || appState.currentDepute.votes.length === 0) {
      badge.textContent = 'Aucun vote disponible pour ce depute.';
      return;
    }

    if (appState.generator && appState.activeModelConfig) {
      const modeLabel = resolveThinkingModeFlag(appState.activeModelConfig) ? 'thinking' : 'non-thinking';
      badge.textContent = `Modele actif: ${appState.activeModelConfig.displayName} (${modeLabel}).`;
      return;
    }

    if (hasWebGPU()) {
      badge.textContent = 'Reponses exactes actives. Chargez un modele pour l analyse.';
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
      userInput.placeholder = 'Choisissez un depute pour commencer.';
      updateChatCapabilitiesBanner();
      renderQuickActions();
      updateChatEmptyState();
      return;
    }

    if (!appState.currentDepute.votes || appState.currentDepute.votes.length === 0) {
      userInput.disabled = true;
      sendBtn.disabled = true;
      userInput.placeholder = 'Aucun vote disponible pour ce depute.';
      updateChatCapabilitiesBanner();
      renderQuickActions();
      updateChatEmptyState();
      return;
    }

    userInput.disabled = false;
    sendBtn.disabled = false;

    if (appState.generator) {
      userInput.placeholder = 'Posez votre question sur les votes de ce depute...';
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

    userInput.placeholder = 'Questions exactes disponibles. Chargez un modele pour les analyses.';
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
