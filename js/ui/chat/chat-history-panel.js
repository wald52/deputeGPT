function showInlineConfirmation(container, { message, confirmLabel, cancelLabel, confirmStyle, onConfirm, onCancel }) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding:12px; background:#fff8e1; border:1px solid #f0c36d; border-radius:8px; margin:8px 0;';

  const msg = document.createElement('div');
  msg.style.cssText = 'font-size:0.82rem; color:#5d4037; margin-bottom:10px;';
  msg.textContent = message;
  wrapper.appendChild(msg);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = cancelLabel || 'Annuler';
  cancelBtn.style.cssText = 'padding:6px 14px; border:1px solid #ccc; border-radius:6px; background:white; cursor:pointer; font-size:0.78rem;';
  cancelBtn.addEventListener('click', () => { wrapper.remove(); onCancel?.(); });
  btnRow.appendChild(cancelBtn);

  const okBtn = document.createElement('button');
  okBtn.textContent = confirmLabel || 'Confirmer';
  okBtn.style.cssText = confirmStyle || 'padding:6px 14px; border:none; border-radius:6px; background:#c62828; color:white; cursor:pointer; font-size:0.78rem; font-weight:600;';
  okBtn.addEventListener('click', () => { wrapper.remove(); onConfirm?.(); });
  btnRow.appendChild(okBtn);

  wrapper.appendChild(btnRow);
  container.appendChild(wrapper);
  okBtn.focus();
  return wrapper;
}

function buildChatHistoryPanelHtmlInternal() {
  return `
    <div style="padding: 12px; border-bottom: 1px solid #e2ebf5; display:flex; justify-content:space-between; align-items:center; background:#f6faff;">
      <h3 style="margin:0; font-size:0.95rem; color:#1b365f;">Historique des chats</h3>
      <button id="close-history-btn" style="background:none; border:none; font-size:1.2rem; cursor:pointer; color:#47638b;">&times;</button>
    </div>
    <div id="history-list" style="flex: 1; overflow-y: auto; padding: 8px;"></div>
    <div style="padding: 8px; border-top: 1px solid #e2ebf5; display: flex; gap: 8px;">
      <button id="export-json-btn" style="flex:1; padding: 8px; background:#1b63c6; color:white; border:none; border-radius:8px; cursor:pointer; font-size:0.78rem; font-weight:700;">Export JSON</button>
      <button id="export-jsonl-btn" style="flex:1; padding: 8px; background:#1b63c6; color:white; border:none; border-radius:8px; cursor:pointer; font-size:0.78rem; font-weight:700;">Export JSONL</button>
    </div>
    <div style="padding: 8px; border-top: 1px solid #e2ebf5;">
      <button id="clear-history-btn" style="width:100%; padding:8px; background:#b7322d; color:white; border:none; border-radius:8px; cursor:pointer; font-size:0.78rem; font-weight:700;">Supprimer tout l'historique</button>
    </div>
  `;
}

function buildChatHistoryButtonsInternal({
  toggleHistoryPanel
}) {
  const historyButtons = document.createElement('div');
  historyButtons.className = 'history-buttons';

  const historyBtn = document.createElement('button');
  historyBtn.id = 'history-btn';
  historyBtn.className = 'header-action-btn';
  historyBtn.title = 'Historique des chats';
  historyBtn.textContent = 'Historique';
  historyBtn.addEventListener('click', toggleHistoryPanel);
  historyButtons.appendChild(historyBtn);

  return historyButtons;
}

export function createChatHistoryPanelController({
  initChatHistory,
  getChatHistory,
  getDeputesData,
  chatSessionState,
  updateChatScopeSummary,
  clearRenderedMessages,
  updateChatEmptyState,
  addMessage,
  selectDepute,
  escapeHtml
}) {
  function getHistoryPanel() {
    return document.getElementById('history-panel');
  }

  async function ensureChatHistoryReady() {
    const existing = getChatHistory();
    if (existing) {
      return existing;
    }

    if (typeof initChatHistory === 'function') {
      return initChatHistory();
    }

    return null;
  }

  function updateHistoryPanelLayout(panel = getHistoryPanel()) {
    if (!panel) {
      return;
    }

    const maxWidth = Math.min(360, Math.max(280, window.innerWidth - 16));
    panel.style.width = `${maxWidth}px`;
    const isOpen = panel.style.right === '0px';
    const closedRight = `-${maxWidth + 12}px`;
    panel.dataset.closedRight = closedRight;
    if (!isOpen) {
      panel.style.right = closedRight;
    }
  }

  function closeHistoryPanel() {
    const panel = getHistoryPanel();
    if (!panel) {
      return;
    }

    panel.style.right = panel.dataset.closedRight || '-340px';
  }

  async function refreshHistoryList() {
    const listDiv = document.getElementById('history-list');
    const chatHistory = await ensureChatHistoryReady();
    if (!listDiv || !chatHistory) {
      if (listDiv) {
        listDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Historique indisponible</div>';
      }
      return;
    }

    listDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Chargement...</div>';

    try {
      const sessions = await chatHistory.getSessionsSummary();

      if (sessions.length === 0) {
        listDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Aucun chat sauvegarde</div>';
        return;
      }

      listDiv.innerHTML = '';

      sessions.forEach(session => {
        const item = document.createElement('div');
        item.style.cssText = `
          padding: 10px;
          border-bottom: 1px solid #eee;
          cursor: pointer;
          transition: background 0.2s;
        `;
        item.onmouseenter = () => {
          item.style.background = '#f8f9fa';
        };
        item.onmouseleave = () => {
          item.style.background = 'transparent';
        };

        const date = new Date(session.updatedAt);
        const dateStr = date.toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        });

        item.innerHTML = `
          <div style="font-weight: 600; font-size: 0.85rem; color: #2c3e50; margin-bottom: 4px;">
            ${escapeHtml(session.deputeName || 'Depute inconnu')}
          </div>
          <div style="font-size: 0.75rem; color: #666; margin-bottom: 4px;">
            ${session.messageCount} message${session.messageCount > 1 ? 's' : ''} • ${dateStr}
          </div>
          <div style="font-size: 0.7rem; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(session.preview)}
          </div>
        `;

        item.addEventListener('click', () => {
          restoreSession(session.id);
        });
        listDiv.appendChild(item);
      });
    } catch (error) {
      console.error('Erreur chargement historique:', error);
      listDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: #e74c3c;">Erreur de chargement</div>';
    }
  }

  async function restoreSession(sessionId) {
    const chatHistory = await ensureChatHistoryReady();
    if (!chatHistory) {
      return;
    }

    try {
      const session = await chatHistory.getSession(sessionId);
      if (!session) {
        closeHistoryPanel();
        await addMessage('system', 'Session introuvable. Elle a peut-etre ete supprimee.', { method: 'system' });
        return;
      }

      closeHistoryPanel();

      const depute = getDeputesData().find(currentDepute => currentDepute.id === session.deputeId);
      if (!depute) {
        await addMessage('system', 'Le depute de cette session n\'est plus disponible dans les donnees actuelles.', { method: 'system' });
        return;
      }

      await selectDepute(depute);
      chatHistory.setActiveSessionId(sessionId);

      if (session.sessionState) {
        Object.assign(chatSessionState, session.sessionState);
      }
      updateChatScopeSummary();

      const messagesDiv = document.getElementById('messages');
      clearRenderedMessages(messagesDiv);
      updateChatEmptyState();

      for (const message of session.messages) {
        const type = message.role === 'assistant' ? 'ai' : message.role;
        await addMessage(type, message.content, {
          method: message.method,
          metadata: message.metadata,
          saveToHistory: false
        });
      }

      console.debug(`Session restauree: ${sessionId}`);
    } catch (error) {
      console.error('Erreur restauration session:', error);
      await addMessage('system', 'Erreur lors de la restauration de la session. Reessayez ou selectionnez un autre depute.', { method: 'system' });
    }
  }

  function createHistoryPanel() {
    const existingPanel = getHistoryPanel();
    if (existingPanel) {
      existingPanel.remove();
    }

    const panel = document.createElement('div');
    panel.id = 'history-panel';
    panel.style.cssText = `
      position: fixed;
      top: 0;
      right: -340px;
      width: 340px;
      max-width: calc(100vw - 16px);
      height: 100vh;
      background: white;
      box-shadow: -4px 0 12px rgba(0,0,0,0.15);
      z-index: 3000;
      display: flex;
      flex-direction: column;
      transition: right 0.3s ease;
    `;
    panel.dataset.closedRight = '-340px';
    panel.innerHTML = buildChatHistoryPanelHtmlInternal();

    document.body.appendChild(panel);
    updateHistoryPanelLayout(panel);
    window.addEventListener('resize', () => updateHistoryPanelLayout(panel));

    document.getElementById('close-history-btn').addEventListener('click', closeHistoryPanel);

    document.getElementById('export-json-btn').addEventListener('click', () => {
      const chatHistory = getChatHistory();
      if (chatHistory) {
        chatHistory.downloadExport({ format: 'json' });
      }
    });

    document.getElementById('export-jsonl-btn').addEventListener('click', () => {
      const chatHistory = getChatHistory();
      if (chatHistory) {
        chatHistory.downloadExport({ format: 'jsonl' });
      }
    });

    document.getElementById('clear-history-btn').addEventListener('click', async () => {
      const chatHistory = getChatHistory();
      if (!chatHistory) {
        return;
      }

      const btn = document.getElementById('clear-history-btn');
      if (btn.dataset.confirmOpen === 'true') {
        return;
      }
      btn.dataset.confirmOpen = 'true';
      btn.disabled = true;
      btn.textContent = 'Confirmer la suppression ?';
      showInlineConfirmation(btn.parentElement, {
        message: 'Supprimer tout l\'historique des chats ? Cette action est irreversible.',
        confirmLabel: 'Supprimer',
        cancelLabel: 'Annuler',
        onConfirm: async () => {
          await chatHistory.deleteAllSessions();
          await refreshHistoryList();
          btn.disabled = false;
          btn.textContent = 'Supprimer tout l\'historique';
          delete btn.dataset.confirmOpen;
        },
        onCancel: () => {
          btn.disabled = false;
          btn.textContent = 'Supprimer tout l\'historique';
          delete btn.dataset.confirmOpen;
        }
      });
    });
  }

  async function toggleHistoryPanel() {
    const panel = getHistoryPanel();
    if (!panel) {
      return;
    }

    updateHistoryPanelLayout(panel);

    const isOpen = panel.style.right === '0px';
    if (isOpen) {
      closeHistoryPanel();
      return;
    }

    const chatHistory = await ensureChatHistoryReady();
    if (!chatHistory) {
      await addMessage('system', 'Historique non disponible sur cet appareil. Le stockage local est desactive.', { method: 'system' });
      return;
    }

    await refreshHistoryList();
    panel.style.right = '0px';
  }

  async function showExportMenu() {
    const chatHistory = await ensureChatHistoryReady();
    if (!chatHistory) {
      await addMessage('system', 'Historique non disponible pour l\'export.', { method: 'system' });
      return;
    }

    const panel = getHistoryPanel();
    const exportContainer = panel?.querySelector('#export-json-btn')?.parentElement;
    if (!exportContainer) {
      chatHistory.downloadExport({ format: 'json' });
      return;
    }

    if (exportContainer.dataset.confirmOpen === 'true') {
      return;
    }
    exportContainer.dataset.confirmOpen = 'true';

    showInlineConfirmation(exportContainer, {
      message: 'Choisir le format d\'export.',
      confirmLabel: 'JSON (complet)',
      cancelLabel: 'JSONL (RAG)',
      confirmStyle: 'padding:6px 14px; border:none; border-radius:6px; background:#1b63c6; color:white; cursor:pointer; font-size:0.78rem; font-weight:600;',
      onConfirm: () => {
        chatHistory.downloadExport({ format: 'json' });
        delete exportContainer.dataset.confirmOpen;
      },
      onCancel: () => {
        chatHistory.downloadExport({ format: 'jsonl' });
        delete exportContainer.dataset.confirmOpen;
      }
    });
  }

  function setupChatHistoryUI() {
    const chatHeader = document.querySelector('.unified-header-row');
    if (!chatHeader) {
      return;
    }

    const existingHistoryButtons = chatHeader.querySelector('.history-buttons');
    if (existingHistoryButtons) {
      existingHistoryButtons.remove();
    }

    const historyButtons = buildChatHistoryButtonsInternal({
      toggleHistoryPanel
    });

    const loadBtn = document.getElementById('load-model-btn');
    if (loadBtn) {
      loadBtn.parentNode.insertBefore(historyButtons, loadBtn);
    } else {
      chatHeader.appendChild(historyButtons);
    }

    createHistoryPanel();
  }

  return {
    setupChatHistoryUI,
    toggleHistoryPanel,
    refreshHistoryList,
    restoreSession,
    showExportMenu
  };
}
