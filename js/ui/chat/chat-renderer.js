const CHAT_RENDERER_METHOD_LABELS = {
  deterministic: 'exacte',
  analysis_rag: 'analyse',
  clarify: 'clarification',
  system: 'systeme',
  llm: 'llm'
};

function escapeChatRendererHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function createChatRenderer({
  appState,
  defaultChatListLimit,
  formatChatTime,
  buildMessageReferencesFromVoteIds,
  openVoteSourceModal,
  submitChatQuestion,
  resolvePaginationOffset,
  handlePaginationRequest,
  updateChatEmptyState,
  persistMessage
}) {
  function syncInteractiveMessageButtonState(button) {
    if (!button) {
      return;
    }

    const isIntrinsicallyDisabled = button.dataset.messageIntrinsicDisabled === 'true';
    const isLocked = button.dataset.messageLocked === 'true';
    button.disabled = isIntrinsicallyDisabled || isLocked || appState.isChatBusy;
  }

  function configureInteractiveMessageButton(button, { intrinsicallyDisabled = false, locked = false } = {}) {
    if (!button) {
      return;
    }

    button.dataset.messageInteractive = 'true';
    button.dataset.messageIntrinsicDisabled = intrinsicallyDisabled ? 'true' : 'false';
    button.dataset.messageLocked = locked ? 'true' : 'false';
    syncInteractiveMessageButtonState(button);
  }

  function setInteractiveMessageButtonLockState(button, locked = true) {
    if (!button) {
      return;
    }

    button.dataset.messageLocked = locked ? 'true' : 'false';
    syncInteractiveMessageButtonState(button);
  }

  function syncInteractiveMessageStates(root = document) {
    const buttons = [];

    if (typeof root?.matches === 'function' && root.matches('[data-message-interactive="true"]')) {
      buttons.push(root);
    }

    const scopedButtons = typeof root?.querySelectorAll === 'function'
      ? root.querySelectorAll('[data-message-interactive="true"]')
      : document.querySelectorAll('[data-message-interactive="true"]');

    buttons.push(...scopedButtons);
    buttons.forEach(button => syncInteractiveMessageButtonState(button));
  }

  async function streamText(contentElement, fullText, messagesDiv) {
    const words = fullText.split(/(\s+)/);
    let displayedText = '';
    const cursor = '<span class="streaming-cursor">▋</span>';
    const chunkSize = 3;

    for (let index = 0; index < words.length; index += chunkSize) {
      for (let offset = 0; offset < chunkSize && (index + offset) < words.length; offset += 1) {
        displayedText += words[index + offset];
      }

      contentElement.innerHTML = escapeChatRendererHtml(displayedText).replace(/\n/g, '<br>') + cursor;
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    contentElement.innerHTML = escapeChatRendererHtml(displayedText).replace(/\n/g, '<br>');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function appendAssumptionNote(messageDiv, metadata = null) {
    const assumptionText = String(metadata?.assumptionText || '').trim();
    if (!messageDiv || !assumptionText) {
      return;
    }

    const assumptionDiv = document.createElement('div');
    assumptionDiv.className = 'message-service-meta';
    assumptionDiv.textContent = assumptionText;
    messageDiv.appendChild(assumptionDiv);
  }

  function shouldRenderInlineVoteItems(metadata = null) {
    return metadata?.referencePresentation === 'inline_rows'
      && Array.isArray(metadata?.inlineVoteItems)
      && metadata.inlineVoteItems.length > 0;
  }

  function resolveMessageBodyText(text, metadata = null) {
    if (shouldRenderInlineVoteItems(metadata)) {
      return String(metadata?.summaryText || text || '').trim();
    }

    return String(text || '');
  }

  function appendInlineVoteItems(messageDiv, metadata = null) {
    if (!messageDiv || !shouldRenderInlineVoteItems(metadata)) {
      return;
    }

    const listDiv = document.createElement('div');
    listDiv.className = 'message-inline-vote-list';

    metadata.inlineVoteItems.forEach(item => {
      const lineText = String(item?.lineText || '').trim();
      const voteId = String(item?.voteId || '').trim();
      if (!lineText || !voteId) {
        return;
      }

      const itemDiv = document.createElement('div');
      itemDiv.className = 'message-inline-vote-item';

      const content = document.createElement('div');
      content.className = 'message-inline-vote-content';

      const line = document.createElement('div');
      line.className = 'message-inline-vote-line';
      line.textContent = lineText;
      content.appendChild(line);

      const meta = document.createElement('div');
      meta.className = 'message-inline-vote-meta';
      meta.textContent = `scrutin ${voteId}`;
      content.appendChild(meta);

      const themeLabel = String(item?.theme || '').trim();
      if (themeLabel) {
        const theme = document.createElement('div');
        theme.className = 'message-inline-vote-theme';
        theme.textContent = `Theme: ${themeLabel}`;
        content.appendChild(theme);
      }

      itemDiv.appendChild(content);

      const sourceUrl = String(item?.sourceUrl || '').trim();
      const actions = document.createElement('div');
      actions.className = 'message-inline-vote-actions';

      if (sourceUrl) {
        const sourceBtn = document.createElement('button');
        sourceBtn.type = 'button';
        sourceBtn.className = 'message-reference-action-btn';
        sourceBtn.textContent = "Voir dans l'app";
        configureInteractiveMessageButton(sourceBtn, {
          intrinsicallyDisabled: typeof openVoteSourceModal !== 'function'
        });
        sourceBtn.addEventListener('click', () => {
          const opened = openVoteSourceModal?.({
            title: String(item?.modalTitle || `Scrutin ${voteId}`),
            voteId,
            date: String(item?.date || ''),
            sourceUrl
          });
          if (opened === false) {
            setInteractiveMessageButtonLockState(sourceBtn, false);
          }
        });
        actions.appendChild(sourceBtn);
      }

      if (actions.childNodes.length > 0) {
        itemDiv.appendChild(actions);
      }

      listDiv.appendChild(itemDiv);
    });

    if (listDiv.childNodes.length > 0) {
      messageDiv.appendChild(listDiv);
    }
  }

  function appendMessageReferences(messageDiv, metadata = null) {
    if (!messageDiv || !metadata) {
      return;
    }

    if (metadata.referencePresentation === 'inline_rows') {
      return;
    }

    const fallbackMaxItems = metadata.method === 'analysis_rag' ? 6 : 8;
    const references = Array.isArray(metadata.references) && metadata.references.length > 0
      ? metadata.references
      : buildMessageReferencesFromVoteIds(metadata.voteIds, { maxItems: fallbackMaxItems });

    if (!references.length) {
      return;
    }

    const refsDiv = document.createElement('div');
    refsDiv.className = 'message-references';
    if (metadata.method === 'analysis_rag') {
      refsDiv.classList.add('message-references-analysis');
    }

    const refsTitle = document.createElement('div');
    refsTitle.className = 'message-references-title';
    refsTitle.textContent = metadata.method === 'analysis_rag' ? 'Votes cites dans l analyse' : 'References';
    refsDiv.appendChild(refsTitle);

    const refsList = document.createElement('div');
    refsList.className = 'message-reference-list';

    references.forEach(reference => {
      const sourceUrl = String(reference?.sourceUrl || '').trim();
      const itemDiv = document.createElement('div');
      itemDiv.className = 'message-reference-item';

      const content = document.createElement('div');
      content.className = 'message-reference-content';

      const label = document.createElement('div');
      label.className = 'message-reference-link';
      label.textContent = reference.title || `Scrutin ${reference.voteId}`;
      content.appendChild(label);

      const meta = document.createElement('div');
      meta.className = 'message-reference-meta';
      meta.textContent = [
        reference.date ? `[${reference.date}]` : '',
        reference.voteId ? `scrutin ${reference.voteId}` : ''
      ].filter(Boolean).join(' ');
      content.appendChild(meta);

      if (reference.theme) {
        const theme = document.createElement('div');
        theme.className = 'message-reference-theme';
        theme.textContent = `Thème: ${reference.theme}`;
        content.appendChild(theme);
      }

      itemDiv.appendChild(content);

      const actions = document.createElement('div');
      actions.className = 'message-reference-actions';

      if (sourceUrl) {
        const sourceBtn = document.createElement('button');
        sourceBtn.type = 'button';
        sourceBtn.className = 'message-reference-action-btn';
        sourceBtn.textContent = "Voir dans l'app";
        configureInteractiveMessageButton(sourceBtn, {
          intrinsicallyDisabled: typeof openVoteSourceModal !== 'function'
        });
        sourceBtn.addEventListener('click', () => {
          const opened = openVoteSourceModal?.({
            title: reference.title || `Scrutin ${reference.voteId}`,
            voteId: reference.voteId || '',
            date: reference.date || '',
            sourceUrl
          });
          if (opened === false) {
            setInteractiveMessageButtonLockState(sourceBtn, false);
          }
        });
        actions.appendChild(sourceBtn);
      }

      if (actions.childNodes.length === 0) {
        actions.hidden = true;
      }

      itemDiv.appendChild(actions);
      refsList.appendChild(itemDiv);
    });

    refsDiv.appendChild(refsList);
    messageDiv.appendChild(refsDiv);
  }

  function appendServiceMeta(messageDiv, metadata = null) {
    if (!messageDiv || !metadata) {
      return;
    }

    if (metadata.method === 'analysis_rag') {
      const providerUsed = String(metadata?.providerUsed || '').trim();
      const modelUsed = String(metadata?.modelUsed || '').trim();
      const fallbackCount = Number.isFinite(metadata?.fallbackCount) ? metadata.fallbackCount : 0;
      const routeUsed = String(metadata?.routeUsed || '').trim();

      if (!providerUsed && !modelUsed && !routeUsed && fallbackCount <= 0) {
        return;
      }

      const serviceDiv = document.createElement('div');
      serviceDiv.className = 'message-service-meta';
      serviceDiv.textContent = [
        providerUsed || null,
        modelUsed || null,
        routeUsed ? `route ${routeUsed}` : null,
        fallbackCount > 0 ? `${fallbackCount} fallback${fallbackCount > 1 ? 's' : ''}` : null
      ].filter(Boolean).join(' · ');

      messageDiv.appendChild(serviceDiv);
      return;
    }

    if (!metadata.assistantUsed) {
      return;
    }

    const assistantProvider = String(metadata?.assistantProvider || '').trim();
    const assistantModel = String(metadata?.assistantModel || '').trim();
    if (!assistantProvider && !assistantModel) {
      return;
    }

    const serviceDiv = document.createElement('div');
    serviceDiv.className = 'message-service-meta';
    serviceDiv.textContent = [
      'Clarification assistee',
      assistantProvider || null,
      assistantModel || null
    ].filter(Boolean).join(' · ');

    messageDiv.appendChild(serviceDiv);
  }

  function appendClarificationActions(messageDiv, metadata = null) {
    const choices = Array.isArray(metadata?.choices) ? metadata.choices : [];
    if (!messageDiv || choices.length === 0) {
      return;
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-followup-actions';

    choices.forEach(choice => {
      const choiceLabel = String(choice?.label || '').trim();
      const choiceQuestion = String(choice?.question || '').trim();
      if (!choiceLabel || !choiceQuestion) {
        return;
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'message-followup-btn';
      button.textContent = choiceLabel;
      configureInteractiveMessageButton(button, {
        intrinsicallyDisabled: typeof submitChatQuestion !== 'function'
      });
      button.addEventListener('click', () => {
        setInteractiveMessageButtonLockState(button, true);
        const submitted = submitChatQuestion?.(choiceQuestion);
        if (!submitted) {
          setInteractiveMessageButtonLockState(button, false);
        }
      });
      actionsDiv.appendChild(button);
    });

    if (actionsDiv.childNodes.length === 0) {
      return;
    }

    messageDiv.appendChild(actionsDiv);
  }

  function appendMessagePaginationActions(messageDiv, metadata = null) {
    if (!messageDiv || !metadata) {
      return;
    }

    const allVoteIds = Array.isArray(metadata.allVoteIds) ? metadata.allVoteIds : [];
    const displayedVoteIds = Array.isArray(metadata.displayedVoteIds) ? metadata.displayedVoteIds : [];

    if (!allVoteIds.length || displayedVoteIds.length >= allVoteIds.length) {
      return;
    }

    const remainingCount = allVoteIds.length - resolvePaginationOffset(metadata);
    if (remainingCount <= 0) {
      return;
    }

    const nextBatchSize = Math.min(
      Number.isFinite(metadata.pageSize) ? metadata.pageSize : defaultChatListLimit,
      remainingCount
    );

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-followup-actions';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'message-followup-btn';
    button.textContent = `Afficher ${nextBatchSize} de plus`;
    configureInteractiveMessageButton(button);
    button.addEventListener('click', async () => {
      setInteractiveMessageButtonLockState(button, true);
      let completed = false;

      try {
        completed = await handlePaginationRequest(metadata);
      } finally {
        if (!completed) {
          setInteractiveMessageButtonLockState(button, false);
        }
      }
    });

    actionsDiv.appendChild(button);
    messageDiv.appendChild(actionsDiv);
  }

  function appendMessageMeta(messageDiv, type, method = null) {
    const metaDiv = document.createElement('div');
    metaDiv.className = 'message-meta';

    const timeDiv = document.createElement('span');
    timeDiv.className = 'message-time';
    timeDiv.textContent = formatChatTime();
    metaDiv.appendChild(timeDiv);

    if (type === 'ai' && method && method !== 'system') {
      const methodBadge = document.createElement('span');
      methodBadge.className = 'message-method-badge';
      methodBadge.textContent = CHAT_RENDERER_METHOD_LABELS[method] || method;
      metaDiv.appendChild(methodBadge);
    }

    if (type === 'system') {
      metaDiv.style.display = 'none';
    }

    messageDiv.appendChild(metaDiv);
  }

  async function addMessage(type, text, options = {}) {
    const { method = null, metadata = null, saveToHistory = true } = options;
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    const resolvedText = resolveMessageBodyText(text, metadata);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = escapeChatRendererHtml(resolvedText).replace(/\n/g, '<br>');
    messageDiv.appendChild(contentDiv);

    if (type === 'ai') {
      appendAssumptionNote(messageDiv, metadata);
      appendServiceMeta(messageDiv, metadata);
      appendInlineVoteItems(messageDiv, metadata);
      appendClarificationActions(messageDiv, metadata);
      appendMessagePaginationActions(messageDiv, metadata);
      appendMessageReferences(messageDiv, metadata);
    }
    appendMessageMeta(messageDiv, type, method);

    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    syncInteractiveMessageStates(messagesDiv);
    updateChatEmptyState();

    if (saveToHistory) {
      await persistMessage({
        role: type === 'ai' ? 'assistant' : type,
        content: resolvedText,
        method,
        metadata
      }, 'message');
    }

    return messageDiv;
  }

  async function renderAssistantMessage(messagesDiv, loaderElement, answer, options = {}) {
    const { method = null, metadata = null, stream = false } = options;
    const resolvedAnswer = resolveMessageBodyText(answer, metadata);

    if (loaderElement?._dotInterval) {
      clearInterval(loaderElement._dotInterval);
    }
    if (loaderElement?.remove) {
      loaderElement.remove();
    }

    const responseMessage = document.createElement('div');
    responseMessage.className = 'message ai';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    responseMessage.appendChild(contentDiv);
    messagesDiv.appendChild(responseMessage);

    if (stream) {
      await streamText(contentDiv, resolvedAnswer, messagesDiv);
    } else {
      contentDiv.innerHTML = escapeChatRendererHtml(resolvedAnswer).replace(/\n/g, '<br>');
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    appendAssumptionNote(responseMessage, metadata);
    appendServiceMeta(responseMessage, metadata);
    appendInlineVoteItems(responseMessage, metadata);
    appendClarificationActions(responseMessage, metadata);
    appendMessagePaginationActions(responseMessage, metadata);
    appendMessageReferences(responseMessage, metadata);
    appendMessageMeta(responseMessage, 'ai', method);
    syncInteractiveMessageStates(messagesDiv);
    updateChatEmptyState();

    await persistMessage({
      role: 'assistant',
      content: resolvedAnswer,
      method,
      metadata
    }, 'response');
  }

  return {
    addMessage,
    appendMessageMeta,
    appendMessagePaginationActions,
    appendMessageReferences,
    renderAssistantMessage,
    syncInteractiveMessageStates,
    streamText
  };
}
