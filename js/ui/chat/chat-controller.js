export function createChatController({
  appState,
  chatSessionState,
  addMessage,
  adjustChatInputHeight,
  buildAnalysisContextVotes,
  buildDeterministicMessageMetadata,
  buildMessageReferencesFromVoteIds,
  dedupeVotes,
  ensureSearchIndexReady,
  executeDeterministicRoute,
  extractAnswerFromOutput,
  getChatHistory,
  getSelectedInferenceSource,
  getVoteId,
  hasWebGPU,
  isThinkingModeEnabled,
  lookupVoteSubject,
  lookupVoteThemeLabel,
  renderAssistantMessage,
  renderQuickActions,
  resolveGenerationOptions,
  resolveThinkingModeFlag,
  routeQuestion,
  sanitizeGeneratedAnswer,
  syncChatAvailability,
  syncSendButtonState,
  truncateAnalysisField,
  updateChatCapabilitiesBanner,
  updateChatEmptyState,
  updateSessionFromResult,
  analysisMaxNewTokens
}) {
  function createChatLoadingMessageInternal(messagesDiv) {
    const tempLoader = document.createElement('div');
    tempLoader.className = 'message ai message-loading';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = 'Analyse en cours';
    tempLoader.appendChild(contentDiv);

    let dotCount = 0;
    const dotInterval = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      contentDiv.textContent = `Analyse en cours${'.'.repeat(dotCount)}`;
    }, 500);

    tempLoader._dotInterval = dotInterval;
    messagesDiv.appendChild(tempLoader);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    updateChatEmptyState();
    return tempLoader;
  }

  function buildAnalysisPromptContextInternal(contextVotes, currentDepute) {
    const uniqueVotes = dedupeVotes(contextVotes);
    const contextStr = uniqueVotes
      .map(vote => {
        const parts = [
          `- [${vote.date}] scrutin ${getVoteId(vote)}`,
          `vote de la deputee : ${vote.vote}`,
          `titre : ${truncateAnalysisField(vote.titre)}`
        ];
        const subject = lookupVoteSubject(vote);
        const theme = lookupVoteThemeLabel(vote);

        if (subject && subject !== vote.titre) {
          parts.push(`sujet : ${truncateAnalysisField(subject)}`);
        }

        if (theme) {
          parts.push(`theme : ${theme}`);
        }

        return parts.join(' | ');
      })
      .join('\n');

    const systemPrompt =
      `Tu es un assistant expert en politique francaise. Tu analyses les votes des deputes a l'Assemblee Nationale.\n\n` +
      `CONTEXTE RETENU POUR ${currentDepute.prenom.toUpperCase()} ${currentDepute.nom.toUpperCase()} :\n` +
      `${contextStr}\n\n` +
      `INSTRUCTIONS IMPORTANTES :\n` +
      `- Reponds exclusivement en francais.\n` +
      `- Ne montre jamais ton raisonnement interne.\n` +
      `- Donne uniquement la reponse finale, sans balises ni preambule technique.\n` +
      `- Utilise UNIQUEMENT les votes fournis ci-dessus.\n` +
      `- Si l'information n'est pas dans les votes, dis-le clairement.\n` +
      `- Vise une reponse courte, idealement 120 mots maximum.\n` +
      `- Cite 2 a 4 votes precis avec la date quand c'est utile.\n` +
      `- Reste factuel, synthetique et transparent sur tes limites.\n`;

    return {
      systemPrompt,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: null }
      ]
    };
  }

  async function syncHistorySessionStateInternal() {
    const chatHistory = getChatHistory();
    if (chatHistory && chatHistory.getActiveSessionId()) {
      await chatHistory.updateSessionState(chatHistory.getActiveSessionId(), chatSessionState);
    }
  }

  function setupChat() {
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('user-input');
    const messagesDiv = document.getElementById('messages');

    adjustChatInputHeight(input);
    syncSendButtonState();
    updateChatEmptyState();

    sendBtn.addEventListener('click', async () => {
      if (!appState.currentDepute) {
        await addMessage('system', "Veuillez d'abord selectionner un depute.", { method: 'system' });
        return;
      }

      if (!appState.currentDepute.votes || appState.currentDepute.votes.length === 0) {
        await addMessage('system', 'Aucun vote n\'est disponible pour ce depute.', { method: 'system' });
        return;
      }

      const question = input.value.trim();
      if (!question) {
        return;
      }

      appState.isChatBusy = true;
      updateChatCapabilitiesBanner();
      renderQuickActions();

      await addMessage('user', question, { saveToHistory: true });
      input.value = '';
      adjustChatInputHeight(input);
      sendBtn.disabled = true;
      input.disabled = true;

      const tempLoader = createChatLoadingMessageInternal(messagesDiv);

      try {
        const route = routeQuestion(question, chatSessionState);
        const shouldPrimeSearchIndex = route.action === 'analysis_rag' || Boolean(route.scope?.filters?.queryText);

        if (shouldPrimeSearchIndex) {
          await ensureSearchIndexReady();
        }

        if (route.action === 'clarify') {
          await renderAssistantMessage(messagesDiv, tempLoader, route.message, { method: 'clarify' });
          return;
        }

        if (route.action === 'deterministic') {
          const result = executeDeterministicRoute(route, question, appState.currentDepute);
          if (result.kind === 'clarify') {
            await renderAssistantMessage(messagesDiv, tempLoader, result.message, { method: 'clarify' });
            return;
          }

          updateSessionFromResult(chatSessionState, {
            ...result,
            query: question,
            plan: route.plan || null
          });
          await syncHistorySessionStateInternal();

          await renderAssistantMessage(messagesDiv, tempLoader, result.message, {
            method: 'deterministic',
            metadata: buildDeterministicMessageMetadata(result, route.intent.kind)
          });
          return;
        }

        if (!appState.generator) {
          const selectedInferenceSource = typeof getSelectedInferenceSource === 'function'
            ? getSelectedInferenceSource()
            : 'local';
          const guidance = selectedInferenceSource === 'openrouter'
            ? 'Cette question demande une synthese. Activez OpenRouter avec votre cle API pour lancer l analyse. Sans backend distant, vous pouvez me demander une liste, un comptage, une periode ou un theme precis.'
            : hasWebGPU()
              ? 'Cette question demande une synthese. Chargez un modele via le bouton CHARGER pour lancer l analyse. Sans modele, vous pouvez me demander une liste, un comptage, une periode ou un theme precis.'
              : 'Cette question demande une synthese. Sur cet appareil, seules les questions exactes sans IA sont disponibles car WebGPU est absent.';
          await renderAssistantMessage(messagesDiv, tempLoader, guidance, { method: 'clarify' });
          return;
        }

        const contextVotes = await buildAnalysisContextVotes(route, question, appState.currentDepute.votes);
        if (contextVotes.length === 0) {
          await renderAssistantMessage(messagesDiv, tempLoader, 'Je ne trouve pas assez de votes pertinents pour produire une analyse fiable.', { method: 'analysis_rag' });
          return;
        }

        updateSessionFromResult(chatSessionState, {
          voteIds: contextVotes.map(getVoteId),
          query: question,
          filters: route.scope.filters,
          sort: route.scope.filters.sort,
          scopeSource: route.scope.source,
          limit: contextVotes.length,
          plan: route.plan || null
        });
        await syncHistorySessionStateInternal();

        const analysisPrompt = buildAnalysisPromptContextInternal(contextVotes, appState.currentDepute);
        analysisPrompt.messages[1].content = question;

        const enableThinking = resolveThinkingModeFlag(appState.activeModelConfig, isThinkingModeEnabled());
        const genOptions = resolveGenerationOptions(
          appState.activeModelConfig,
          { enable_thinking: enableThinking },
          { max_new_tokens: analysisMaxNewTokens }
        );
        genOptions.enable_thinking = enableThinking;

        const out = await appState.generator(analysisPrompt.messages, genOptions);
        let answer = sanitizeGeneratedAnswer(extractAnswerFromOutput(out), analysisPrompt.systemPrompt, question);

        if (!answer) {
          answer = "Desole, je n'ai pas pu produire une reponse finale exploitable. Veuillez reessayer.";
        }

        await renderAssistantMessage(messagesDiv, tempLoader, answer, {
          method: 'analysis_rag',
          metadata: {
            method: 'analysis_rag',
            voteIds: contextVotes.map(getVoteId),
            references: buildMessageReferencesFromVoteIds(contextVotes.map(getVoteId), { maxItems: 6 }),
            filters: route.scope.filters,
            plan: route.plan || null,
            modelUsed: appState.activeModelConfig?.displayName,
            generationMode: resolveThinkingModeFlag(appState.activeModelConfig) ? 'thinking' : 'non-thinking'
          }
        });
      } catch (error) {
        if (tempLoader._dotInterval) {
          clearInterval(tempLoader._dotInterval);
        }
        tempLoader.remove();

        let errorMessage = "Une erreur s'est produite pendant la generation.";
        const rawErrorMessage = String(error?.message || '');
        const normalizedErrorMessage = rawErrorMessage.toLowerCase();
        if (rawErrorMessage) {
          errorMessage = normalizedErrorMessage.includes('fetch')
            ? "Erreur reseau : impossible de telecharger le modele. Verifiez votre connexion."
            : `Erreur : ${rawErrorMessage}`;
        }

        if (
          normalizedErrorMessage.includes('ortrun') ||
          normalizedErrorMessage.includes('invalid buffer') ||
          normalizedErrorMessage.includes('mapasync')
        ) {
          errorMessage = appState.activeModelConfig?.runtime === 'qwen3_5_low_level'
            ? "Erreur WebGPU pendant la generation. Le contexte a ete fortement reduit, mais Qwen3.5 reste experimental dans le navigateur. Reessayez avec Qwen3 stable ou une quantification plus legere."
            : "Erreur WebGPU pendant la generation. Reessayez avec une question plus courte ou un modele plus leger.";
        }

        await addMessage('system', errorMessage, { method: 'system' });
        console.error('Erreur detaillee:', error);
      } finally {
        appState.isChatBusy = false;
        syncChatAvailability();
        syncSendButtonState();
        input.focus();
      }
    });

    input.addEventListener('input', () => {
      adjustChatInputHeight(input);
      syncSendButtonState();
    });

    input.addEventListener('keypress', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!sendBtn.disabled) {
          sendBtn.click();
        }
      }
    });
  }

  return {
    setupChat
  };
}
