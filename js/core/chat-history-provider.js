export function createChatHistoryProvider() {
  let currentChatHistory = null;

  async function initChatHistory() {
    if (currentChatHistory) {
      return currentChatHistory;
    }

    try {
      const module = await import('../chat-history.js');
      currentChatHistory = module.ChatHistory || window.ChatHistory;
      if (currentChatHistory) {
        await currentChatHistory.init();
      }
      return currentChatHistory;
    } catch (error) {
      console.warn('⚠️ Module chat-history.js non disponible:', error);
      return null;
    }
  }

  function getChatHistory() {
    return currentChatHistory;
  }

  return {
    getChatHistory,
    initChatHistory
  };
}
