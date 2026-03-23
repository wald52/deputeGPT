const { test, expect } = require('playwright/test');

async function mountChatControllerHarness(page, {
  route,
  ensureOnlineAnalysisReadyError = null,
  deterministicResult = {
    kind: 'list',
    message: 'Liste de test',
    voteIds: ['101'],
    displayedVoteIds: ['101'],
    allVoteIds: ['101'],
    filters: {},
    scopeSource: 'depute_all',
    limit: 1
  },
  analysisContextVotes = []
} = {}) {
  await page.goto('/tests/fixtures/chat-controller-harness.html');

  await page.evaluate(async ({ route, ensureOnlineAnalysisReadyError, deterministicResult, analysisContextVotes }) => {
    const { createChatController } = await import('/js/ui/chat/chat-controller.js');

    const calls = {
      ensureOnlineAnalysisReady: 0,
      ensureSearchIndexReady: 0,
      addedMessages: [],
      assistantMessages: [],
      sessionUpdates: []
    };

    window.__chatControllerCalls = calls;
    window.__chatControllerRoute = route;

    const controller = createChatController({
      appState: {
        currentDepute: {
          prenom: 'Jean',
          nom: 'Dupont',
          votes: [{ numero: '101', date: '2025-02-01', titre: 'Vote test', vote: 'pour' }]
        },
        generator: null,
        activeModelConfig: null,
        isChatBusy: false
      },
      chatSessionState: {
        pendingClarification: null,
        lastResultVoteIds: []
      },
      addMessage: async (type, text, options = {}) => {
        calls.addedMessages.push({ type, text, options });
        return true;
      },
      adjustChatInputHeight: () => {},
      buildAnalysisContextVotes: async () => analysisContextVotes,
      buildDeterministicMessageMetadata: () => ({ method: 'deterministic' }),
      buildMessageReferencesFromVoteIds: () => [],
      dedupeVotes: votes => votes,
      ensureOnlineAnalysisReady: async () => {
        calls.ensureOnlineAnalysisReady += 1;
        if (ensureOnlineAnalysisReadyError) {
          throw new Error(ensureOnlineAnalysisReadyError);
        }
        return true;
      },
      ensureSearchIndexReady: async () => {
        calls.ensureSearchIndexReady += 1;
        return true;
      },
      executeDeterministicRoute: () => deterministicResult,
      extractAnswerFromOutput: output => output,
      getChatHistory: () => null,
      getSelectedInferenceSource: () => 'online',
      getVoteId: vote => vote.numero,
      hasWebGPU: () => true,
      isThinkingModeEnabled: () => false,
      lookupVoteSubject: () => '',
      lookupVoteThemeLabel: () => '',
      renderAssistantMessage: async (_messagesDiv, loaderElement, answer, options = {}) => {
        loaderElement?._dotInterval && clearInterval(loaderElement._dotInterval);
        loaderElement?.remove?.();
        calls.assistantMessages.push({ answer, options });
        return true;
      },
      renderQuickActions: () => {},
      resolveGenerationOptions: () => ({}),
      resolveThinkingModeFlag: () => false,
      routeQuestion: () => window.__chatControllerRoute,
      sanitizeGeneratedAnswer: output => output,
      syncChatAvailability: () => {},
      syncSendButtonState: () => {},
      syncInteractiveMessageStates: () => {},
      truncateAnalysisField: value => value,
      updateChatCapabilitiesBanner: () => {},
      updateChatEmptyState: () => {},
      updateSessionFromResult: (_session, result) => {
        calls.sessionUpdates.push(result);
      },
      analysisMaxNewTokens: 220
    });

    controller.setupChat();
  }, { route, ensureOnlineAnalysisReadyError, deterministicResult, analysisContextVotes });

  await page.evaluate(() => {
    document.getElementById('user-input').value = 'Question de test';
  });
}

test('une question exacte ne prepare pas la voie en ligne', async ({ page }) => {
  await mountChatControllerHarness(page, {
    route: {
      action: 'deterministic',
      scope: { filters: {}, source: 'depute_all' },
      intent: { kind: 'list' },
      plan: { questionType: 'list', candidateStrategy: 'deterministic', requiresLlm: false, responseMode: 'list' },
      assumptionText: null
    }
  });

  await page.getByRole('button', { name: 'Envoyer' }).click();

  await expect.poll(() => page.evaluate(() => window.__chatControllerCalls.ensureOnlineAnalysisReady)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__chatControllerCalls.assistantMessages.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__chatControllerCalls.assistantMessages[0]?.options?.method)).toBe('deterministic');
});

test('une question d analyse tente la voie en ligne et affiche un secours clair si elle echoue', async ({ page }) => {
  await mountChatControllerHarness(page, {
    route: {
      action: 'analysis_rag',
      scope: { filters: {}, source: 'depute_all' },
      intent: { kind: 'analysis' },
      plan: { questionType: 'analysis', candidateStrategy: 'analysis_rag', requiresLlm: true, responseMode: 'analysis' },
      assumptionText: null
    },
    ensureOnlineAnalysisReadyError: 'Worker Cloudflare indisponible'
  });

  await page.getByRole('button', { name: 'Envoyer' }).click();

  await expect.poll(() => page.evaluate(() => window.__chatControllerCalls.ensureOnlineAnalysisReady)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__chatControllerCalls.addedMessages.find(message => message.type === 'system')?.text || '')).toContain(
    'Impossible d activer l IA en ligne : Worker Cloudflare indisponible'
  );
});
