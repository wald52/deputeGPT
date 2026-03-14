export function createChatViewportController({
  emptyStateText
}) {
  function ensureChatEmptyState(messagesDiv = document.getElementById('messages')) {
    if (!messagesDiv) {
      return null;
    }

    let emptyState = document.getElementById('chat-empty-state');
    if (!emptyState) {
      emptyState = document.createElement('div');
      emptyState.id = 'chat-empty-state';
      emptyState.className = 'chat-empty-state';
      emptyState.textContent = emptyStateText;
    }

    if (emptyState.parentElement !== messagesDiv) {
      messagesDiv.prepend(emptyState);
    }

    return emptyState;
  }

  function clearRenderedMessages(messagesDiv = document.getElementById('messages')) {
    if (!messagesDiv) {
      return;
    }

    messagesDiv.querySelectorAll('.message').forEach(message => message.remove());
    ensureChatEmptyState(messagesDiv);
  }

  function updateChatEmptyState() {
    const messagesDiv = document.getElementById('messages');
    if (!messagesDiv) {
      return;
    }

    const emptyState = ensureChatEmptyState(messagesDiv);
    if (!emptyState) {
      return;
    }

    const hasMessages = Boolean(messagesDiv.querySelector('.message'));
    emptyState.classList.toggle('hidden', hasMessages);
  }

  return {
    ensureChatEmptyState,
    clearRenderedMessages,
    updateChatEmptyState
  };
}
