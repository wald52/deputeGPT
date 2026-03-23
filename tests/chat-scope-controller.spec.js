const { test, expect } = require('playwright/test');

test('buildDeterministicMessageMetadata construit des inlineVoteItems serialisables pour une liste', async ({ page }) => {
  await page.goto('/tests/fixtures/chat-renderer-harness.html');

  const metadata = await page.evaluate(async () => {
    const { createChatScopeController } = await import('/js/ui/chat/chat-scope-controller.js');
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
      }
    ];

    const voteTextHelpers = createVoteTextHelpers({
      defaultChatListLimit: 12,
      getVoteId: vote => vote.numero,
      lookupVoteSubject: vote => vote.titre,
      lookupVoteThemeLabel: vote => vote.numero === '101' ? 'sante' : '',
      lookupVoteSourceUrl: vote => vote.sourceUrl || ''
    });

    const controller = createChatScopeController({
      appState: { currentDepute: null, isChatBusy: false },
      chatSessionState: {},
      scopeSourceLabels: { depute_all: 'Tous les votes' },
      defaultChatListLimit: 12,
      createScope: () => ({ filters: {} }),
      normalizeQuestion: value => value,
      detectSubjectRequest: () => false,
      resolveVotesByIds: voteIds => votes.filter(vote => voteIds.includes(vote.numero)),
      describeDateFilter: () => '',
      describeQueryFilter: () => '',
      addMessage: async () => {},
      executeDeterministicRoute: () => ({}),
      buildInlineVoteItems: voteTextHelpers.buildInlineVoteItems,
      buildMessageReferencesFromVoteIds: () => [],
      getChatHistory: () => null,
      syncInteractiveMessageStates: () => {},
      updateChatCapabilitiesBanner: () => {},
      renderQuickActions: () => {}
    });

    return controller.buildDeterministicMessageMetadata({
      voteIds: ['101', '102', '103'],
      displayedVoteIds: ['101', '102'],
      summaryText: 'Jean Dupont a 2 votes correspondants.',
      referencePresentation: 'inline_rows',
      inlineVoteMode: 'list',
      filters: {},
      sort: 'date_desc',
      limit: 2
    }, 'list');
  });

  expect(metadata.referencePresentation).toBe('inline_rows');
  expect(metadata.inlineVoteMode).toBe('list');
  expect(metadata.references).toEqual([]);
  expect(metadata.summaryText).toBe('Jean Dupont a 2 votes correspondants.');
  expect(metadata.inlineVoteItems).toEqual([
    {
      voteId: '101',
      lineText: '[2025-02-01] Pour - Amendement test [theme: sante]',
      date: '2025-02-01',
      theme: 'sante',
      sourceUrl: 'https://www.assemblee-nationale.fr/dyn/17/scrutins/101',
      modalTitle: 'Amendement test'
    },
    {
      voteId: '102',
      lineText: '[2025-02-02] Contre - Article 3',
      date: '2025-02-02',
      theme: '',
      sourceUrl: '',
      modalTitle: 'Article 3'
    }
  ]);
});
