export function createChatHistoryPersistence({
  getChatHistory
}) {
  async function persistChatMessage(payload, kind = 'message') {
    const chatHistory = getChatHistory();
    if (!chatHistory || !chatHistory.getActiveSessionId()) {
      return;
    }

    try {
      await chatHistory.addMessageToSession(chatHistory.getActiveSessionId(), payload);
    } catch (error) {
      const label = kind === 'response' ? 'réponse' : 'message';
      console.warn(`⚠️ Erreur sauvegarde ${label} dans historique:`, error);
    }
  }

  return {
    persistChatMessage
  };
}
