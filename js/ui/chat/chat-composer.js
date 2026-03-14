export function createChatComposer({
  appState,
  quickActions
}) {
  function adjustChatInputHeight(inputEl = document.getElementById('user-input')) {
    if (!inputEl) {
      return;
    }

    inputEl.style.height = 'auto';
    const nextHeight = Math.min(inputEl.scrollHeight, 116);
    inputEl.style.height = `${Math.max(38, nextHeight)}px`;
  }

  function syncSendButtonState() {
    const input = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    if (!input || !sendBtn) {
      return;
    }

    if (input.disabled) {
      sendBtn.disabled = true;
      return;
    }

    sendBtn.disabled = !input.value.trim();
  }

  function submitChatQuestion(question) {
    const input = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    if (!input || !sendBtn) {
      return false;
    }

    if (appState.isChatBusy || input.disabled) {
      return false;
    }

    input.value = String(question || '').trim();
    adjustChatInputHeight(input);
    syncSendButtonState();

    if (sendBtn.disabled) {
      return false;
    }

    sendBtn.click();
    return true;
  }

  function renderQuickActions() {
    const actionsContainer = document.getElementById('chat-quick-actions');
    const input = document.getElementById('user-input');
    if (!actionsContainer || !input) {
      return;
    }

    const enabled = Boolean(appState.currentDepute && appState.currentDepute.votes && appState.currentDepute.votes.length > 0 && !appState.isChatBusy && !input.disabled);
    actionsContainer.innerHTML = '';

    quickActions.forEach(action => {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'chat-quick-action';
      actionBtn.textContent = action.label;
      actionBtn.disabled = !enabled;
      actionBtn.addEventListener('click', () => {
        submitChatQuestion(action.question);
      });
      actionsContainer.appendChild(actionBtn);
    });
  }

  return {
    adjustChatInputHeight,
    renderQuickActions,
    submitChatQuestion,
    syncSendButtonState
  };
}
