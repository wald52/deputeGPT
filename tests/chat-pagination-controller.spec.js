const { test, expect } = require('playwright/test');

test('handlePaginationRequest emet une suite inline sans redondance de references', async ({ page }) => {
  await page.goto('/tests/fixtures/chat-renderer-harness.html');

  const calls = await page.evaluate(async () => {
    const { createChatPaginationController } = await import('/js/ui/chat/chat-pagination-controller.js');
    const { createVoteTextHelpers } = await import('/js/domain/vote-text.js');

    const votes = [
      {
        numero: '101',
        date: '2025-02-01',
        titre: 'Amendement test',
        vote: 'Pour',
        sourceUrl: 'https://www.assemblee-nationale.fr/dyn/17/scrutins/101'
      },
      {
        numero: '102',
        date: '2025-02-02',
        titre: 'Article 3',
        vote: 'Contre',
        sourceUrl: ''
      },
      {
        numero: '103',
        date: '2025-02-03',
        titre: 'Article 4',
        vote: 'Abstention',
        sourceUrl: 'https://www.assemblee-nationale.fr/dyn/17/scrutins/103'
      }
    ];

    const capturedMessages = [];
    const updatedSessions = [];

    const voteTextHelpers = createVoteTextHelpers({
      defaultChatListLimit: 1,
      getVoteId: vote => vote.numero,
      lookupVoteSubject: vote => vote.titre,
      lookupVoteThemeLabel: () => '',
      lookupVoteSourceUrl: vote => vote.sourceUrl || ''
    });

    const controller = createChatPaginationController({
      appState: {
        currentDepute: { votes },
        isChatBusy: false
      },
      chatSessionState: {
        lastResultVoteIds: ['101'],
        lastResultQuery: 'Liste de test',
        lastFilters: {},
        lastSort: 'date_desc'
      },
      defaultChatListLimit: 1,
      resolveVotesByIds: voteIds => votes.filter(vote => voteIds.includes(vote.numero)),
      buildInlineVoteItems: voteTextHelpers.buildInlineVoteItems,
      buildPaginationContinuationMessage: voteTextHelpers.buildPaginationContinuationMessage,
      addMessage: async (type, text, options = {}) => {
        capturedMessages.push({ type, text, options });
        return true;
      },
      updateSessionFromResult: (_session, result) => {
        updatedSessions.push(result);
      },
      getChatHistory: () => null,
      syncInteractiveMessageStates: () => {},
      updateChatCapabilitiesBanner: () => {},
      renderQuickActions: () => {}
    });

    await controller.handlePaginationRequest({
      listMode: 'list',
      allVoteIds: ['101', '102', '103'],
      displayedVoteIds: ['101'],
      pageSize: 1,
      filters: {},
      sort: 'date_desc'
    });

    return { capturedMessages, updatedSessions };
  });

  expect(calls.capturedMessages).toHaveLength(2);
  expect(calls.capturedMessages[0]).toMatchObject({
    type: 'user',
    text: 'Afficher 1 de plus'
  });
  expect(calls.capturedMessages[1].type).toBe('ai');
  expect(calls.capturedMessages[1].options.metadata).toMatchObject({
    referencePresentation: 'inline_rows',
    inlineVoteMode: 'list',
    summaryText: 'Suite de la liste: votes 2 a 2 sur 3.',
    displayedVoteIds: ['101', '102'],
    voteIds: ['102'],
    references: []
  });
  expect(calls.capturedMessages[1].options.metadata.inlineVoteItems).toEqual([
    {
      voteId: '102',
      lineText: '[2025-02-02] Contre - Article 3',
      date: '2025-02-02',
      theme: '',
      sourceUrl: '',
      modalTitle: 'Article 3'
    }
  ]);
  expect(calls.updatedSessions).toEqual([
    {
      displayedVoteIds: ['101', '102'],
      voteIds: ['101', '102', '103'],
      query: 'Liste de test',
      filters: {},
      sort: 'date_desc',
      scopeSource: 'last_result',
      limit: 2
    }
  ]);
});
