export function createChatSessionState(activeDeputeId = null) {
  return {
    activeDeputeId,
    lastResultVoteIds: [],
    lastResultQuery: '',
    lastFilters: null,
    lastSort: 'date_desc',
    lastLimit: null,
    lastScopeSource: 'depute_all',
    lastTheme: null,
    lastDateRange: null,
    lastPlan: null,
    pendingClarification: null
  };
}

export const chatSessionState = createChatSessionState();

export const appState = {
  currentDepute: null,
  generator: null,
  activeModelConfig: null,
  pendingModelConfig: null,
  lastOnlineResponseMeta: null,
  openRouterModels: [],
  openRouterCatalogStatus: 'idle',
  openRouterCatalogError: null,
  semanticEncoder: null,
  semanticModelConfig: null,
  semanticIndexMode: 'single_vector',
  semanticRagStatus: 'disabled',
  isChatBusy: false
};

export function resetChatSessionState(activeDeputeId = null) {
  Object.assign(chatSessionState, createChatSessionState(activeDeputeId));
  return chatSessionState;
}
