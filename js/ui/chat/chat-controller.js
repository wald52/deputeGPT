import { resolveStructuredPendingClarification } from '../../domain/clarification-resolution.js';

const CLARIFICATION_ASSISTANT_MAX_ATTEMPTS = 1;
const CLARIFICATION_ASSISTANT_MIN_CONFIDENCE = 0.72;
const CLARIFICATION_ASSISTANT_MAX_NEW_TOKENS = 180;

export function createChatController({
  appState,
  chatSessionState,
  addMessage,
  adjustChatInputHeight,
  buildAnalysisContextVotes,
  buildDeterministicMessageMetadata,
  buildMessageReferencesFromVoteIds,
  dedupeVotes,
  ensureOnlineAnalysisReady,
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
  syncInteractiveMessageStates,
  truncateAnalysisField,
  updateChatCapabilitiesBanner,
  updateChatEmptyState,
  updateSessionFromResult,
  analysisMaxNewTokens
}) {
  function isRemoteProviderInternal() {
    const provider = String(appState.activeModelConfig?.provider || '').trim();
    const runtime = String(appState.activeModelConfig?.runtime || '').trim();
    return provider === 'online' || provider === 'openrouter' || runtime.endsWith('_remote');
  }

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

  function extractJsonObjectInternal(rawText) {
    const text = String(rawText || '')
      .replace(/```json/giu, '')
      .replace(/```/gu, '')
      .trim();
    if (!text) {
      return null;
    }

    const firstBraceIndex = text.indexOf('{');
    if (firstBraceIndex < 0) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let index = firstBraceIndex; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (isEscaped) {
          isEscaped = false;
          continue;
        }

        if (char === '\\') {
          isEscaped = true;
          continue;
        }

        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        depth += 1;
        continue;
      }

      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return text.slice(firstBraceIndex, index + 1);
        }
      }
    }

    return null;
  }

  function parseClarificationAssistantDecisionInternal(rawText) {
    const jsonText = extractJsonObjectInternal(rawText);
    if (!jsonText) {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonText);
      const confidence = Number(parsed?.confidence);
      return {
        resolved: parsed?.resolved === true,
        clarificationKind: String(parsed?.clarificationKind || '').trim() || null,
        scopeSource: String(parsed?.scopeSource || '').trim() || null,
        mode: String(parsed?.mode || '').trim() || null,
        limit: Number.isFinite(Number(parsed?.limit)) ? Number(parsed.limit) : null,
        assumptionText: String(parsed?.assumptionText || '').trim() || null,
        confidence: Number.isFinite(confidence) ? confidence : null
      };
    } catch (error) {
      console.warn('Clarification assistee: JSON invalide.', error);
      return null;
    }
  }

  function buildClarificationAssistantPromptInternal(pendingClarification, userAnswer) {
    const prompt = [
      'Tu es un moteur de desambiguïsation pour un chat sur les votes d un depute.',
      'Tu ne reponds jamais a la question politique.',
      'Tu transformes uniquement la reponse libre de l utilisateur en JSON strict.',
      'Renvoie exactement un objet JSON valide sur une ligne, sans markdown.',
      'Champs autorises:',
      '- resolved: boolean',
      '- clarificationKind: "scope" | "mode" | "large_list"',
      '- scopeSource: "depute_all" | "last_result" | null',
      '- mode: "list" | "count" | "subjects" | "analysis" | null',
      '- limit: number | null',
      '- assumptionText: string | null',
      '- confidence: number entre 0 et 1',
      'Regles:',
      '- clarificationKind doit reprendre la clarification en attente.',
      '- pending kind=scope: il faut au minimum scopeSource.',
      '- pending kind=mode: il faut au minimum mode.',
      '- pending kind=large_list: il faut au minimum limit ou mode.',
      '- resolved=true seulement si l ambiguite restante est levee.',
      '- Si tu hesites, renvoie resolved=false, confidence<=0.6 et les autres champs a null.',
      '- assumptionText doit etre court, en francais, et ne decrire qu une hypothese de desambiguïsation.'
    ].join('\n');

    const userMessage = [
      `Clarification en attente: ${pendingClarification?.kind || 'inconnue'}`,
      `Question initiale: ${pendingClarification?.originalQuestion || ''}`,
      `Prompt de clarification affiche: ${pendingClarification?.prompt || ''}`,
      `Scope de base: ${pendingClarification?.baseScope?.source || 'depute_all'}`,
      `Dernier resultat disponible: ${Array.isArray(chatSessionState?.lastResultVoteIds) && chatSessionState.lastResultVoteIds.length > 0 ? 'oui' : 'non'}`,
      `Reponse utilisateur: ${String(userAnswer || '').trim()}`
    ].join('\n');

    return {
      systemPrompt: prompt,
      userMessage,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userMessage }
      ]
    };
  }

  function buildClarificationMetadataInternal(route, extra = {}) {
    const choices = Array.isArray(route?.clarificationChoices)
      ? route.clarificationChoices
      : Array.isArray(extra.choices)
        ? extra.choices
        : [];

    return {
      method: 'clarify',
      clarificationKind: route?.clarificationKind || extra.clarificationKind || null,
      choices,
      assumptionText: String(extra.assumptionText || route?.assumptionText || '').trim() || null,
      assistantUsed: Boolean(extra.assistantUsed),
      assistantProvider: String(extra.assistantProvider || '').trim() || null,
      assistantModel: String(extra.assistantModel || '').trim() || null
    };
  }

  function mergeClarificationAssistanceMetadataInternal(baseMetadata = {}, extra = {}) {
    return {
      ...baseMetadata,
      assumptionText: String(extra.assumptionText || baseMetadata.assumptionText || '').trim() || null,
      assistantUsed: Boolean(baseMetadata.assistantUsed || extra.assistantUsed),
      assistantProvider: String(extra.assistantProvider || baseMetadata.assistantProvider || '').trim() || null,
      assistantModel: String(extra.assistantModel || baseMetadata.assistantModel || '').trim() || null
    };
  }

  function clonePendingScopeInternal(scope) {
    if (!scope) {
      return null;
    }

    return {
      source: scope.source || 'depute_all',
      voteIds: Array.isArray(scope.voteIds) ? [...scope.voteIds] : null,
      isFollowUp: Boolean(scope.isFollowUp),
      filters: {
        ...(scope.filters || {})
      },
      needsClarification: Boolean(scope.needsClarification),
      clarification: scope.clarification || null,
      clarifyReason: scope.clarifyReason || null
    };
  }

  function clonePendingPlanInternal(plan) {
    if (!plan) {
      return null;
    }

    return {
      questionType: plan.questionType || 'clarify',
      candidateStrategy: plan.candidateStrategy || 'none',
      requiresLlm: Boolean(plan.requiresLlm),
      responseMode: plan.responseMode || 'clarify',
      unsupportedReason: plan.unsupportedReason || null
    };
  }

  function buildPendingClarificationInternal(kind, originalQuestion, prompt, route, previousPendingClarification = null) {
    const effectiveKind = kind || previousPendingClarification?.kind || null;
    const effectiveOriginalQuestion = previousPendingClarification?.originalQuestion || originalQuestion;
    const effectiveBaseScope = previousPendingClarification?.baseScope || route?.scope;
    if (!effectiveKind || !effectiveOriginalQuestion || !effectiveBaseScope) {
      return null;
    }

    return {
      kind: effectiveKind,
      originalQuestion: effectiveOriginalQuestion,
      baseScope: clonePendingScopeInternal(effectiveBaseScope),
      basePlan: clonePendingPlanInternal(previousPendingClarification?.basePlan || route?.plan || null),
      prompt,
      createdAt: previousPendingClarification?.createdAt || new Date().toISOString(),
      attemptCount: Number(previousPendingClarification?.attemptCount || 0)
    };
  }

  async function setPendingClarificationInternal(pendingClarification) {
    chatSessionState.pendingClarification = pendingClarification || null;
    await syncHistorySessionStateInternal();
  }

  function incrementPendingClarificationAttemptInternal(pendingClarification, prompt, route) {
    if (!pendingClarification) {
      return null;
    }

    const nextPendingClarification = buildPendingClarificationInternal(
      route?.clarificationKind || pendingClarification.kind,
      pendingClarification.originalQuestion,
      prompt,
      route,
      pendingClarification
    );
    if (!nextPendingClarification) {
      return null;
    }

    nextPendingClarification.attemptCount = Number(pendingClarification.attemptCount || 0) + 1;
    return nextPendingClarification;
  }

  async function attemptClarificationWithAssistantInternal(question, pendingClarification) {
    const attemptCount = Number(pendingClarification?.attemptCount || 0);
    if (!pendingClarification || !appState.generator || attemptCount >= CLARIFICATION_ASSISTANT_MAX_ATTEMPTS) {
      return {
        attempted: false,
        metadata: null
      };
    }

    const assistantPrompt = buildClarificationAssistantPromptInternal(pendingClarification, question);
    const isRemoteModel = isRemoteProviderInternal();
    const assistantMetadata = {
      assistantUsed: true,
      assistantProvider: appState.activeModelConfig?.provider || 'local',
      assistantModel: appState.activeModelConfig?.displayName || null
    };

    try {
      const generationOptions = isRemoteModel
        ? resolveGenerationOptions(
          appState.activeModelConfig,
          {
            temperature: 0.1,
            top_p: 0.1
          },
          { max_new_tokens: CLARIFICATION_ASSISTANT_MAX_NEW_TOKENS }
        )
        : resolveGenerationOptions(
          appState.activeModelConfig,
          {
            enable_thinking: false,
            temperature: 0.1,
            top_p: 0.1,
            do_sample: false
          },
          { max_new_tokens: CLARIFICATION_ASSISTANT_MAX_NEW_TOKENS }
        );

      if (!isRemoteModel) {
        generationOptions.enable_thinking = false;
      }

      const out = await appState.generator(assistantPrompt.messages, generationOptions);
      const remoteMeta = out?.deputeGPTMeta || null;
      if (remoteMeta) {
        appState.lastOnlineResponseMeta = remoteMeta;
        assistantMetadata.assistantProvider = remoteMeta.provider || assistantMetadata.assistantProvider;
        assistantMetadata.assistantModel = remoteMeta.model || assistantMetadata.assistantModel;
      }

      const rawAnswer = sanitizeGeneratedAnswer(
        extractAnswerFromOutput(out),
        assistantPrompt.systemPrompt,
        assistantPrompt.userMessage
      );
      const decision = parseClarificationAssistantDecisionInternal(rawAnswer);
      const resolution = decision?.confidence >= CLARIFICATION_ASSISTANT_MIN_CONFIDENCE
        ? resolveStructuredPendingClarification(decision, chatSessionState)
        : null;

      return {
        attempted: true,
        resolution,
        metadata: {
          ...assistantMetadata,
          assumptionText: decision?.assumptionText || null
        }
      };
    } catch (error) {
      console.warn('Clarification assistee indisponible, retour au guidage deterministe.', error);
      return {
        attempted: true,
        resolution: null,
        metadata: assistantMetadata
      };
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
      syncInteractiveMessageStates?.();

      await addMessage('user', question, { saveToHistory: true });
      input.value = '';
      adjustChatInputHeight(input);
      sendBtn.disabled = true;
      input.disabled = true;

      const tempLoader = createChatLoadingMessageInternal(messagesDiv);

      try {
        const activePendingClarification = chatSessionState.pendingClarification || null;
        let clarificationAssistanceMetadata = null;
        let route = routeQuestion(question, chatSessionState, {
          preferResponseFirst: true,
          hasActiveClarificationProvider: Boolean(appState.generator)
        });
        let effectiveQuestion = route.resolvedQuestion || question;

        if (route.action === 'clarify' && activePendingClarification) {
          const assistantAttempt = await attemptClarificationWithAssistantInternal(question, activePendingClarification);
          clarificationAssistanceMetadata = assistantAttempt.metadata || null;

          if (assistantAttempt.resolution) {
            route = routeQuestion(assistantAttempt.resolution.question || question, chatSessionState, {
              questionOverride: assistantAttempt.resolution.question || activePendingClarification.originalQuestion,
              scopeOverride: assistantAttempt.resolution.scopeOverride,
              intentOverride: assistantAttempt.resolution.intentOverride || null,
              assumptionText: assistantAttempt.resolution.assumptionText || clarificationAssistanceMetadata?.assumptionText || null,
              preferResponseFirst: true,
              hasActiveClarificationProvider: Boolean(appState.generator),
              skipPendingResolution: true
            });
            effectiveQuestion = route.resolvedQuestion || assistantAttempt.resolution.question || effectiveQuestion;
          } else if (assistantAttempt.attempted) {
            await setPendingClarificationInternal(
              incrementPendingClarificationAttemptInternal(activePendingClarification, route.message, route)
              || activePendingClarification
            );
            await renderAssistantMessage(messagesDiv, tempLoader, route.message, {
              method: 'clarify',
              metadata: buildClarificationMetadataInternal(route, clarificationAssistanceMetadata || {})
            });
            return;
          }
        }

        const shouldPrimeSearchIndex = route.action === 'analysis_rag' || Boolean(route.scope?.filters?.queryText);

        if (shouldPrimeSearchIndex) {
          await ensureSearchIndexReady();
        }

        if (route.action === 'clarify') {
          await setPendingClarificationInternal(
            activePendingClarification
              ? incrementPendingClarificationAttemptInternal(activePendingClarification, route.message, route)
              : buildPendingClarificationInternal(route.clarificationKind, effectiveQuestion, route.message, route)
          );
          await renderAssistantMessage(messagesDiv, tempLoader, route.message, {
            method: 'clarify',
            metadata: buildClarificationMetadataInternal(route, clarificationAssistanceMetadata || {})
          });
          return;
        }

        if (chatSessionState.pendingClarification) {
          await setPendingClarificationInternal(null);
        }

        if (route.action === 'deterministic') {
          const result = executeDeterministicRoute(route, effectiveQuestion, appState.currentDepute);
          if (result.kind === 'clarify') {
            await setPendingClarificationInternal(
              activePendingClarification
                ? incrementPendingClarificationAttemptInternal(activePendingClarification, result.message, {
                  ...route,
                  clarificationKind: result.clarificationKind || route.clarificationKind || null,
                  message: result.message
                })
                : buildPendingClarificationInternal(result.clarificationKind, effectiveQuestion, result.message, route)
            );
            await renderAssistantMessage(messagesDiv, tempLoader, result.message, {
              method: 'clarify',
              metadata: buildClarificationMetadataInternal({
                ...route,
                clarificationKind: result.clarificationKind || route.clarificationKind || null,
                message: result.message
              }, clarificationAssistanceMetadata || {})
            });
            return;
          }

          updateSessionFromResult(chatSessionState, {
            ...result,
            query: effectiveQuestion,
            plan: route.plan || null
          });
          await syncHistorySessionStateInternal();

          await renderAssistantMessage(messagesDiv, tempLoader, result.message, {
            method: 'deterministic',
            metadata: mergeClarificationAssistanceMetadataInternal(
              {
                ...buildDeterministicMessageMetadata(result, route.intent.kind),
                assumptionText: route.assumptionText || null
              },
              clarificationAssistanceMetadata || {}
            )
          });
          return;
        }

        if (!appState.generator) {
          const selectedInferenceSource = typeof getSelectedInferenceSource === 'function'
            ? getSelectedInferenceSource()
            : 'online';

          if (selectedInferenceSource === 'online' && typeof ensureOnlineAnalysisReady === 'function') {
            try {
              await ensureOnlineAnalysisReady();
            } catch (error) {
              if (tempLoader._dotInterval) {
                clearInterval(tempLoader._dotInterval);
              }
              tempLoader.remove();
              const remoteSetupMessage = String(error?.message || '').trim()
                || 'Le service IA en ligne est indisponible pour le moment.';
              await addMessage('system', `Impossible d activer l IA en ligne : ${remoteSetupMessage}`, { method: 'system' });
              return;
            }
          }
        }

        if (!appState.generator) {
          const selectedInferenceSource = typeof getSelectedInferenceSource === 'function'
            ? getSelectedInferenceSource()
            : 'online';
          const guidance = selectedInferenceSource === 'online'
            ? 'Cette question demande une synthese. Le service IA en ligne reste indisponible pour le moment. Vous pouvez continuer avec des listes, comptages, periodes ou themes precis, ou activer un modele local dans les reglages avances.'
            : hasWebGPU()
              ? 'Cette question demande une synthese. Chargez un modele local via le bouton CHARGER pour lancer l analyse. Sans modele, vous pouvez me demander une liste, un comptage, une periode ou un theme precis.'
              : 'Cette question demande une synthese. Sur cet appareil, seules les questions exactes sans IA sont disponibles car WebGPU est absent.';
          await renderAssistantMessage(messagesDiv, tempLoader, guidance, {
            method: 'clarify',
            metadata: buildClarificationMetadataInternal({
              clarificationKind: 'mode',
              clarificationChoices: [
                { label: 'Liste', question: 'liste' },
                { label: 'Nombre', question: 'nombre' }
              ]
            }, {
              assumptionText: route.assumptionText || null
            })
          });
          return;
        }

        const contextVotes = await buildAnalysisContextVotes(route, effectiveQuestion, appState.currentDepute.votes);
        if (contextVotes.length === 0) {
          await renderAssistantMessage(messagesDiv, tempLoader, 'Je ne trouve pas assez de votes pertinents pour produire une analyse fiable.', {
            method: 'analysis_rag',
            metadata: mergeClarificationAssistanceMetadataInternal({
              method: 'analysis_rag',
              assumptionText: route.assumptionText || null
            }, clarificationAssistanceMetadata || {})
          });
          return;
        }

        updateSessionFromResult(chatSessionState, {
          voteIds: contextVotes.map(getVoteId),
          query: effectiveQuestion,
          filters: route.scope.filters,
          sort: route.scope.filters.sort,
          scopeSource: route.scope.source,
          limit: contextVotes.length,
          plan: route.plan || null
        });
        await syncHistorySessionStateInternal();

        const analysisPrompt = buildAnalysisPromptContextInternal(contextVotes, appState.currentDepute);
        analysisPrompt.messages[1].content = effectiveQuestion;

        const isRemoteModel = appState.activeModelConfig?.provider === 'online';
        const enableThinking = isRemoteModel
          ? false
          : resolveThinkingModeFlag(appState.activeModelConfig, isThinkingModeEnabled());
        const genOptions = isRemoteModel
          ? resolveGenerationOptions(
            appState.activeModelConfig,
            {},
            { max_new_tokens: analysisMaxNewTokens }
          )
          : resolveGenerationOptions(
            appState.activeModelConfig,
            { enable_thinking: enableThinking },
            { max_new_tokens: analysisMaxNewTokens }
          );

        if (!isRemoteModel) {
          genOptions.enable_thinking = enableThinking;
        }

        const out = await appState.generator(analysisPrompt.messages, genOptions);
        const remoteMeta = out?.deputeGPTMeta || null;
        if (remoteMeta) {
          appState.lastOnlineResponseMeta = remoteMeta;
        }
        let answer = sanitizeGeneratedAnswer(extractAnswerFromOutput(out), analysisPrompt.systemPrompt, effectiveQuestion);

        if (!answer) {
          answer = "Desole, je n'ai pas pu produire une reponse finale exploitable. Veuillez reessayer.";
        }

        await renderAssistantMessage(messagesDiv, tempLoader, answer, {
          method: 'analysis_rag',
          metadata: mergeClarificationAssistanceMetadataInternal({
            method: 'analysis_rag',
            voteIds: contextVotes.map(getVoteId),
            references: buildMessageReferencesFromVoteIds(contextVotes.map(getVoteId), { maxItems: 6 }),
            filters: route.scope.filters,
            plan: route.plan || null,
            modelUsed: remoteMeta?.model || appState.activeModelConfig?.displayName,
            providerUsed: remoteMeta?.provider || null,
            routeUsed: remoteMeta?.route || null,
            fallbackCount: Number.isFinite(remoteMeta?.fallback_count) ? remoteMeta.fallback_count : 0,
            generationMode: isRemoteModel
              ? 'en_ligne'
              : resolveThinkingModeFlag(appState.activeModelConfig) ? 'thinking' : 'non-thinking',
            assumptionText: route.assumptionText || null
          }, clarificationAssistanceMetadata || {})
        });
      } catch (error) {
        if (tempLoader._dotInterval) {
          clearInterval(tempLoader._dotInterval);
        }
        tempLoader.remove();

        let errorMessage = "Une erreur s'est produite pendant la generation.";
        const rawErrorMessage = String(error?.message || '');
        const normalizedErrorMessage = rawErrorMessage.toLowerCase();
        if (error?.code === 'CIRCUIT_OPEN') {
          const retrySeconds = Math.ceil((error.retryAfterMs || 30000) / 1000);
          errorMessage = `Le service IA en ligne est temporairement indisponible apres plusieurs echecs. Reessayez dans ${retrySeconds}s, ou activez un modele local dans les reglages.`;
        } else if (error?.code === 'REMOTE_QUOTA_EXHAUSTED' || error?.nextAction === 'activate_local') {
          errorMessage = 'Les quotas gratuits de l IA en ligne sont epuises pour le moment. Ouvrez Reglages IA puis activez un modele local si vous voulez continuer les analyses.';
        } else if (rawErrorMessage) {
          errorMessage = normalizedErrorMessage.includes('fetch')
            ? (appState.activeModelConfig?.provider === 'online'
              ? "Erreur reseau : impossible de joindre le service IA en ligne. Verifiez votre connexion et le Worker Cloudflare."
              : "Erreur reseau : impossible de telecharger le modele. Verifiez votre connexion.")
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
        syncInteractiveMessageStates?.();
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
