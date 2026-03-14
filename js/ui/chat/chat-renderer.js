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
  submitChatQuestion,
  resolvePaginationOffset,
  handlePaginationRequest,
  updateChatEmptyState,
  persistMessage
}) {
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

  function appendMessageReferences(messageDiv, metadata = null) {
    if (!messageDiv || !metadata) {
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
      const itemDiv = document.createElement('div');
      itemDiv.className = 'message-reference-item';

      const label = document.createElement('div');
      label.className = 'message-reference-link';
      label.textContent = reference.title || `Scrutin ${reference.voteId}`;
      itemDiv.appendChild(label);

      const meta = document.createElement('div');
      meta.className = 'message-reference-meta';
      meta.textContent = [
        reference.date ? `[${reference.date}]` : '',
        reference.voteId ? `scrutin ${reference.voteId}` : ''
      ].filter(Boolean).join(' ');
      itemDiv.appendChild(meta);

      if (reference.theme) {
        const theme = document.createElement('div');
        theme.className = 'message-reference-theme';
        theme.textContent = `Thème: ${reference.theme}`;
        itemDiv.appendChild(theme);
      }

      const actions = document.createElement('div');
      actions.className = 'message-reference-actions';

      const openInAppBtn = document.createElement('button');
      openInAppBtn.type = 'button';
      openInAppBtn.className = 'message-reference-action-btn';
      openInAppBtn.textContent = 'Voir dans l’app';
      openInAppBtn.disabled = !reference.queryText || appState.isChatBusy;
      openInAppBtn.addEventListener('click', () => {
        submitChatQuestion(`montre le vote sur ${reference.queryText}`);
      });
      actions.appendChild(openInAppBtn);

      if (reference.sourceUrl) {
        const sourceLink = document.createElement('a');
        sourceLink.className = 'message-reference-source-link';
        sourceLink.href = reference.sourceUrl;
        sourceLink.target = '_blank';
        sourceLink.rel = 'noopener noreferrer';
        sourceLink.textContent = 'Source Assemblée';
        actions.appendChild(sourceLink);
      }

      itemDiv.appendChild(actions);
      refsList.appendChild(itemDiv);
    });

    refsDiv.appendChild(refsList);
    messageDiv.appendChild(refsDiv);
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
    button.disabled = appState.isChatBusy;
    button.addEventListener('click', async () => {
      button.disabled = true;
      const completed = await handlePaginationRequest(metadata);
      if (!completed) {
        button.disabled = false;
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

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = escapeChatRendererHtml(text).replace(/\n/g, '<br>');
    messageDiv.appendChild(contentDiv);

    if (type === 'ai') {
      appendMessagePaginationActions(messageDiv, metadata);
      appendMessageReferences(messageDiv, metadata);
    }
    appendMessageMeta(messageDiv, type, method);

    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    updateChatEmptyState();

    if (saveToHistory) {
      await persistMessage({
        role: type === 'ai' ? 'assistant' : type,
        content: text,
        method,
        metadata
      }, 'message');
    }

    return messageDiv;
  }

  async function renderAssistantMessage(messagesDiv, loaderElement, answer, options = {}) {
    const { method = null, metadata = null } = options;

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

    await streamText(contentDiv, answer, messagesDiv);
    appendMessagePaginationActions(responseMessage, metadata);
    appendMessageReferences(responseMessage, metadata);
    appendMessageMeta(responseMessage, 'ai', method);
    updateChatEmptyState();

    await persistMessage({
      role: 'assistant',
      content: answer,
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
    streamText
  };
}
