export function createChatPaginationController({
  appState,
  chatSessionState,
  defaultChatListLimit,
  resolveVotesByIds,
  buildPaginationContinuationMessage,
  buildMessageReferencesFromVoteIds,
  addMessage,
  updateSessionFromResult,
  getChatHistory,
  updateChatCapabilitiesBanner,
  renderQuickActions
}) {
  function resolvePaginationOffset(metadata = null) {
    const displayedVoteIds = Array.isArray(metadata?.displayedVoteIds) ? metadata.displayedVoteIds : [];
    const allVoteIds = Array.isArray(metadata?.allVoteIds) ? metadata.allVoteIds : [];
    let offset = displayedVoteIds.length;
    const sessionIds = Array.isArray(chatSessionState?.lastResultVoteIds) ? chatSessionState.lastResultVoteIds : [];

    if (
      sessionIds.length > offset &&
      sessionIds.length <= allVoteIds.length &&
      sessionIds.every((voteId, index) => String(voteId) === String(allVoteIds[index]))
    ) {
      offset = sessionIds.length;
    }

    return offset;
  }

  async function handlePaginationRequest(metadata = null) {
    const allVoteIds = Array.isArray(metadata?.allVoteIds) ? metadata.allVoteIds : [];
    if (!appState.currentDepute || !allVoteIds.length || appState.isChatBusy) {
      return false;
    }

    const currentOffset = resolvePaginationOffset(metadata);
    if (currentOffset >= allVoteIds.length) {
      return false;
    }

    const pageSize = Number.isFinite(metadata?.pageSize) ? metadata.pageSize : defaultChatListLimit;
    const nextOffset = Math.min(currentOffset + pageSize, allVoteIds.length);
    const nextVoteIds = allVoteIds.slice(currentOffset, nextOffset);
    const cumulativeVoteIds = allVoteIds.slice(0, nextOffset);
    const nextVotes = resolveVotesByIds(nextVoteIds);
    const listMode = metadata?.listMode === 'subjects' ? 'subjects' : 'list';
    const buttonLabel = `Afficher ${nextVoteIds.length} de plus`;

    appState.isChatBusy = true;
    updateChatCapabilitiesBanner();
    renderQuickActions();

    try {
      await addMessage('user', buttonLabel, { saveToHistory: true });
      await addMessage('ai', buildPaginationContinuationMessage(nextVotes, {
        mode: listMode,
        startIndex: currentOffset + 1,
        endIndex: nextOffset,
        total: allVoteIds.length
      }), {
        method: 'deterministic',
        metadata: {
          method: 'deterministic',
          listMode,
          pageSize,
          allVoteIds,
          displayedVoteIds: cumulativeVoteIds,
          voteIds: nextVoteIds,
          references: buildMessageReferencesFromVoteIds(nextVoteIds, { maxItems: Math.min(8, nextVoteIds.length) }),
          filters: metadata?.filters || chatSessionState.lastFilters,
          sort: metadata?.sort || chatSessionState.lastSort,
          limit: nextOffset
        }
      });

      updateSessionFromResult(chatSessionState, {
        displayedVoteIds: cumulativeVoteIds,
        voteIds: allVoteIds,
        query: chatSessionState.lastResultQuery || '',
        filters: metadata?.filters || chatSessionState.lastFilters || null,
        sort: metadata?.sort || chatSessionState.lastSort || 'date_desc',
        scopeSource: 'last_result',
        limit: nextOffset
      });

      const chatHistory = getChatHistory();
      if (chatHistory && chatHistory.getActiveSessionId()) {
        await chatHistory.updateSessionState(chatHistory.getActiveSessionId(), chatSessionState);
      }

      return true;
    } finally {
      appState.isChatBusy = false;
      updateChatCapabilitiesBanner();
      renderQuickActions();
    }
  }

  return {
    handlePaginationRequest,
    resolvePaginationOffset
  };
}
