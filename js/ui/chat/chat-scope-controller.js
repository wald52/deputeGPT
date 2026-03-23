function createChatScopeChipInternal(label, value, options = {}) {
  const { multiline = false } = options;
  const chip = document.createElement('span');
  chip.className = 'chat-scope-chip';
  if (multiline) {
    chip.classList.add('chat-scope-chip-multiline');
  }

  const strong = document.createElement('strong');
  strong.textContent = `${label}:`;
  chip.appendChild(strong);

  const valueSpan = document.createElement('span');
  valueSpan.className = 'chat-scope-chip-value';
  valueSpan.textContent = value;
  chip.appendChild(valueSpan);

  return chip;
}

function getScopeActionDefinitionsInternal(chatSessionState) {
  const filters = chatSessionState.lastFilters || {};
  const actions = [];

  if (
    chatSessionState.lastScopeSource !== 'depute_all' ||
    filters.theme ||
    filters.vote ||
    filters.queryText ||
    filters.dateFrom ||
    filters.dateTo
  ) {
    actions.push({ type: 'reset_scope', label: 'Retour aux 12 plus récents' });
  }

  if (filters.theme) {
    actions.push({ type: 'clear_theme', label: 'Retirer le thème' });
  }

  if (filters.dateFrom || filters.dateTo) {
    actions.push({ type: 'clear_date', label: 'Retirer la période' });
  }

  if (filters.vote) {
    actions.push({ type: 'clear_vote', label: 'Retirer le sens de vote' });
  }

  if (filters.queryText) {
    actions.push({ type: 'clear_query', label: 'Retirer la cible' });
  }

  return actions;
}

export function createChatScopeController({
  appState,
  chatSessionState,
  scopeSourceLabels,
  defaultChatListLimit,
  createScope,
  normalizeQuestion,
  detectSubjectRequest,
  resolveVotesByIds,
  describeDateFilter,
  describeQueryFilter,
  addMessage,
  executeDeterministicRoute,
  buildInlineVoteItems,
  buildMessageReferencesFromVoteIds,
  getChatHistory,
  syncInteractiveMessageStates,
  updateChatCapabilitiesBanner,
  renderQuickActions
}) {
  function updateSessionFromResult(session, result) {
    session.lastResultVoteIds = [...(result.displayedVoteIds || result.voteIds || [])];
    session.lastResultQuery = result.query || '';
    session.lastFilters = result.filters || null;
    session.lastSort = result.sort || 'date_desc';
    session.lastLimit = result.limit ?? null;
    session.lastScopeSource = result.scopeSource || 'depute_all';
    session.lastTheme = result.filters?.theme || null;
    session.lastDateRange = {
      dateFrom: result.filters?.dateFrom || null,
      dateTo: result.filters?.dateTo || null
    };
    session.lastPlan = result.plan || session.lastPlan || null;
    session.pendingClarification = null;
    updateChatScopeSummary();
  }

  function updateChatScopeSummary() {
    const container = document.getElementById('chat-scope-summary');
    const actionsContainer = document.getElementById('chat-scope-actions');
    if (!container) {
      return;
    }

    container.innerHTML = '';
    if (actionsContainer) {
      actionsContainer.innerHTML = '';
    }

    if (!appState.currentDepute) {
      container.classList.add('hidden');
      actionsContainer?.classList.add('hidden');
      return;
    }

    const filters = chatSessionState.lastFilters || {};
    const sourceLabel = scopeSourceLabels[chatSessionState.lastScopeSource] || scopeSourceLabels.depute_all;
    const scopeCount = Array.isArray(chatSessionState.lastResultVoteIds) ? chatSessionState.lastResultVoteIds.length : 0;
    const scopeValue = scopeCount > 0 ? `${sourceLabel} · ${scopeCount} vote${scopeCount > 1 ? 's' : ''}` : sourceLabel;

    container.appendChild(createChatScopeChipInternal('Député', `${appState.currentDepute.prenom} ${appState.currentDepute.nom}`));
    container.appendChild(createChatScopeChipInternal('Périmètre', scopeValue));

    if (chatSessionState.lastTheme) {
      container.appendChild(createChatScopeChipInternal('Thème', chatSessionState.lastTheme));
    }

    const dateDescription = describeDateFilter(filters);
    if (dateDescription) {
      container.appendChild(createChatScopeChipInternal('Période', dateDescription));
    }

    if (filters?.vote) {
      container.appendChild(createChatScopeChipInternal('Vote', filters.vote));
    }

    const queryDescription = describeQueryFilter(filters, {
      filteredVotes: resolveVotesByIds(chatSessionState.lastResultVoteIds)
    });
    if (queryDescription) {
      container.appendChild(createChatScopeChipInternal('Cible', queryDescription, { multiline: true }));
    }

    if (chatSessionState.lastSort) {
      const sortLabel = chatSessionState.lastSort === 'date_asc' ? 'date croissante' : 'date decroissante';
      container.appendChild(createChatScopeChipInternal('Tri', sortLabel));
    }

    if (Number.isFinite(chatSessionState.lastLimit) && chatSessionState.lastLimit > 0) {
      container.appendChild(createChatScopeChipInternal('Limite', String(chatSessionState.lastLimit)));
    }

    if (chatSessionState.lastResultQuery) {
      container.appendChild(createChatScopeChipInternal('Derniere demande', chatSessionState.lastResultQuery, { multiline: true }));
    }

    container.classList.remove('hidden');
    renderChatScopeActions(actionsContainer);
  }

  function buildDeterministicMessageMetadata(result, intentKind = 'list') {
    const displayedVoteIds = result.displayedVoteIds || result.voteIds || [];
    const pageSize = Number.isFinite(result.limit) && result.limit > 0 ? result.limit : defaultChatListLimit;
    const inlineVoteMode = result.inlineVoteMode || (intentKind === 'subjects' ? 'subjects' : 'list');
    const referencePresentation = result.referencePresentation === 'inline_rows' ? 'inline_rows' : 'panel';
    const inlineVoteItems = referencePresentation === 'inline_rows'
      ? (typeof buildInlineVoteItems === 'function'
        ? buildInlineVoteItems(resolveVotesByIds(displayedVoteIds), { mode: inlineVoteMode })
        : [])
      : [];

    return {
      method: 'deterministic',
      listMode: inlineVoteMode,
      pageSize,
      voteIds: displayedVoteIds,
      allVoteIds: result.voteIds || [],
      displayedVoteIds,
      references: referencePresentation === 'inline_rows'
        ? []
        : buildMessageReferencesFromVoteIds(displayedVoteIds, { maxItems: 8 }),
      referencePresentation,
      inlineVoteMode,
      inlineVoteItems,
      summaryText: String(result.summaryText || '').trim() || null,
      filters: result.filters,
      plan: result.plan || null,
      sort: result.sort,
      limit: result.limit
    };
  }

  function buildScopeActionRoute(actionType) {
    const baseFilters = {
      ...createScope().filters,
      ...(chatSessionState.lastFilters || {}),
      sort: chatSessionState.lastSort || 'date_desc'
    };
    const pageLimit = Number.isFinite(chatSessionState.lastLimit) && chatSessionState.lastLimit > 0
      ? chatSessionState.lastLimit
      : defaultChatListLimit;

    if (actionType === 'reset_scope') {
      baseFilters.theme = null;
      baseFilters.vote = null;
      baseFilters.queryText = null;
      baseFilters.dateFrom = null;
      baseFilters.dateTo = null;
      baseFilters.limit = defaultChatListLimit;
    }

    if (actionType === 'clear_theme') {
      baseFilters.theme = null;
    }

    if (actionType === 'clear_date') {
      baseFilters.dateFrom = null;
      baseFilters.dateTo = null;
    }

    if (actionType === 'clear_vote') {
      baseFilters.vote = null;
    }

    if (actionType === 'clear_query') {
      baseFilters.queryText = null;
    }

    const hasExplicitFilter = Boolean(
      baseFilters.theme ||
      baseFilters.vote ||
      baseFilters.queryText ||
      baseFilters.dateFrom ||
      baseFilters.dateTo
    );

    if (!hasExplicitFilter) {
      baseFilters.limit = pageLimit;
    }

    const scope = createScope();
    scope.source = hasExplicitFilter ? 'explicit_filter' : 'depute_all';
    scope.filters = baseFilters;

    const normalizedLastQuery = normalizeQuestion(chatSessionState.lastResultQuery || '');
    const intentKind = chatSessionState.lastPlan?.questionType === 'subjects' || detectSubjectRequest(normalizedLastQuery)
      ? 'subjects'
      : 'list';

    return {
      action: 'deterministic',
      scope,
      intent: {
        kind: intentKind
      },
      plan: {
        questionType: intentKind,
        candidateStrategy: scope.source === 'last_result' ? 'last_result_subset' : 'structured_filters',
        requiresLlm: false,
        responseMode: 'deterministic',
        unsupportedReason: null
      }
    };
  }

  async function handleScopeSummaryAction(actionType, actionLabel) {
    if (!appState.currentDepute || appState.isChatBusy) {
      return false;
    }

    const route = buildScopeActionRoute(actionType);

    appState.isChatBusy = true;
    updateChatCapabilitiesBanner();
    renderQuickActions();
    renderChatScopeActions();
    syncInteractiveMessageStates?.();

    try {
      await addMessage('user', actionLabel, { saveToHistory: true });
      const result = executeDeterministicRoute(route, '', appState.currentDepute);

      if (result.kind === 'clarify') {
        await addMessage('ai', result.message, {
          method: 'clarify',
          metadata: null
        });
        return true;
      }

      updateSessionFromResult(chatSessionState, {
        ...result,
        query: actionLabel
      });

      const chatHistory = getChatHistory();
      if (chatHistory && chatHistory.getActiveSessionId()) {
        await chatHistory.updateSessionState(chatHistory.getActiveSessionId(), chatSessionState);
      }

      await addMessage('ai', result.message, {
        method: 'deterministic',
        metadata: buildDeterministicMessageMetadata(result, route.intent.kind)
      });
      return true;
    } finally {
      appState.isChatBusy = false;
      updateChatCapabilitiesBanner();
      renderQuickActions();
      renderChatScopeActions();
      syncInteractiveMessageStates?.();
    }
  }

  function renderChatScopeActions(container = document.getElementById('chat-scope-actions')) {
    if (!container) {
      return;
    }

    const actions = getScopeActionDefinitionsInternal(chatSessionState);
    container.innerHTML = '';

    if (!actions.length || !appState.currentDepute) {
      container.classList.add('hidden');
      return;
    }

    actions.forEach(action => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chat-scope-action-btn';
      button.textContent = action.label;
      button.disabled = appState.isChatBusy;
      button.addEventListener('click', () => {
        handleScopeSummaryAction(action.type, action.label);
      });
      container.appendChild(button);
    });

    container.classList.remove('hidden');
  }

  return {
    buildDeterministicMessageMetadata,
    buildScopeActionRoute,
    handleScopeSummaryAction,
    renderChatScopeActions,
    updateChatScopeSummary,
    updateSessionFromResult
  };
}
